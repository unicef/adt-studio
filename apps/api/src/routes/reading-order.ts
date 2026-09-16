import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  parseBookLabel,
  ReadingOrderItem,
  READING_ORDER_NODE,
  READING_ORDER_ITEM_ID,
  READING_ORDER_BLOCKING_STEPS,
  type StepName,
} from "@adt/types"
import { createBookStorage, type Storage } from "@adt/storage"
import { resolveReadingOrder, readingOrderHref, readSectioningGeneration } from "@adt/pipeline"

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * `createBookStorage` mkdirs unconditionally, so calling it straight from a
 * request parameter turns a typo'd label into a real (empty) book directory and
 * a 200 describing a book that does not exist. Check first, the way the package
 * and preview routes do.
 */
function assertBookExists(safeLabel: string, booksDir: string): void {
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) {
    throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
  }
}

/**
 * A pipeline step writing sectioning or rendering mid-save would change what the
 * order refers to underneath us. Refuse rather than persist an order built from
 * a book that is being rewritten.
 *
 * Only the steps that actually change the slots block — see
 * `READING_ORDER_BLOCKING_STEPS`. Blocking on *any* running step, as this used
 * to, refused a reorder during a captions or speech run that could not possibly
 * affect it, and the sidebar (which greys out only for the storyboard) did not
 * even show it as unavailable, so the save just failed.
 */
function assertNoActivePipelineRun(storage: Storage): void {
  const running = storage
    .getStepRuns()
    .filter((run) => run.status === "running" && READING_ORDER_BLOCKING_STEPS.has(run.step as StepName))
    .map((run) => run.step)
  if (running.length === 0) return
  throw new HTTPException(409, {
    message: `Cannot change the reading order while these steps are running: ${running.join(", ")}. Wait for the run to finish or cancel it first.`,
  })
}

export function createReadingOrderRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/reading-order — the resolved sequence plus what a stored
  // order (if any) no longer lines up with.
  app.get("/books/:label/reading-order", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    assertBookExists(safeLabel, booksDir)
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const resolved = resolveReadingOrder(storage)
      // Loud on the server as well as in the response: a book can be packaged
      // from the CLI or by a scheduled run, where nobody is looking at the UI.
      for (const row of resolved.unreadable) {
        console.error(
          `[reading-order] ${safeLabel}: ${row.node}/${row.itemId} v${String(row.version)} ` +
          `could not be read and was ignored — the book is not in the order it should be`,
        )
      }
      if (resolved.staleGeneration) {
        console.warn(
          `[reading-order] ${safeLabel}: stored order was made against sectioning ` +
          `generation ${String(resolved.staleGeneration.stored)}, the book is now on ` +
          `${String(resolved.staleGeneration.current)} — the arrangement names section ids ` +
          `that have since been re-minted, so it was ignored`,
        )
      }
      return c.json({
        version: resolved.storedVersion,
        fromStoredOrder: resolved.fromStoredOrder,
        // Set when a stored order exists and parsed but describes a section-id
        // space the book has thrown away. Distinct from `unreadable` (the row is
        // fine) and from never having reordered (there is history to show).
        staleGeneration: resolved.staleGeneration,
        // Stored rows that exist but would not parse. Never silently skipped:
        // each one means the book is being assembled from something other than
        // what it holds, and the UI has to be able to say so.
        unreadable: resolved.unreadable,
        // True when the book changed under a stored order — the UI can say so
        // rather than silently showing a different sequence than last time.
        reconciled: resolved.reconcile.changed,
        added: resolved.reconcile.added.map((entry) => entry.item.id),
        dropped: resolved.reconcile.dropped.map((item) => item.id),
        items: resolved.items.map((item) => ({
          kind: item.kind,
          id: item.id,
          href: readingOrderHref(item),
          position: resolved.positionById.get(item.id)!,
          pageId: item.kind === "section" ? item.pageId : item.quiz.afterPageId,
          pageNumber: item.kind === "section" ? item.pageNumber : null,
        })),
        // Includes items excluded from the output (pruned), so the UI can show
        // them in the slot they would occupy if re-included.
        order: resolved.order,
      })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/reading-order — save an explicit order.
  app.put("/books/:label/reading-order", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    assertBookExists(safeLabel, booksDir)

    const Body = z.object({
      items: z.array(ReadingOrderItem),
      /** Reject the write if someone else saved since this order was read. */
      expectedVersion: z.number().int().positive().nullable().optional(),
    })

    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid reading order: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      // Validate and write inside one transaction. Within a single API process
      // the block below is synchronous, so requests cannot interleave — but the
      // save is two writes (the new version, then the dependents it
      // invalidates), and a failure between them would leave a reordered book
      // still pointing at a bundle built for the old sequence. It also makes
      // the `expectedVersion` check binding against another process holding the
      // same book open, where "read then write" genuinely can interleave.
      const version = storage.transaction(() => {
        assertNoActivePipelineRun(storage)

        const resolved = resolveReadingOrder(storage)
        if (
          parsed.data.expectedVersion !== undefined &&
          parsed.data.expectedVersion !== resolved.storedVersion
        ) {
          throw new HTTPException(409, {
            message: `The reading order changed since you loaded it (expected version ${String(parsed.data.expectedVersion)}, found ${String(resolved.storedVersion)}). Reload and try again.`,
          })
        }

        // The body must be a permutation of what the book currently holds.
        // Reordering may not add or remove pages — that is what the structural
        // operations and pruning are for — so a mismatch is rejected rather than
        // silently dropping or resurrecting items.
        const expected = new Set(resolved.order.map((item) => item.id))
        const received = new Set<string>()
        for (const item of parsed.data.items) {
          if (received.has(item.id)) {
            throw new HTTPException(400, {
              message: `Reading order lists ${item.id} more than once`,
            })
          }
          received.add(item.id)
          if (!expected.has(item.id)) {
            throw new HTTPException(400, {
              message: `Reading order references ${item.id}, which is not in this book`,
            })
          }
        }
        const missing = [...expected].filter((id) => !received.has(id))
        if (missing.length > 0) {
          throw new HTTPException(400, {
            message: `Reading order is missing ${String(missing.length)} item(s): ${missing.slice(0, 5).join(", ")}`,
          })
        }

        const saved = storage.putNodeData(READING_ORDER_NODE, READING_ORDER_ITEM_ID, {
          schemaVersion: 1,
          items: parsed.data.items,
          updatedAt: new Date().toISOString(),
          // Which section-id space this arrangement names. A later rebuild
          // re-mints those ids for other content, and the stamp is the only
          // thing that can tell the resulting order apart from a valid one.
          sectioningGeneration: readSectioningGeneration(storage),
        })
        clearReadingOrderDependents(storage)
        return saved
      })

      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/reading-order/reset — put the book back in source-PDF
  // order.
  //
  // Saved as a new version rather than by deleting the entity, so the
  // arrangement being replaced stays in the history and the reset itself can be
  // rolled back. It is also why there is no version representing the original
  // order to begin with: the entity does not exist until the first reorder, so
  // its v1 is already a rearrangement. This is how the user gets back.
  //
  // The order is recomputed now, not recovered from v1 — "PDF order" is a
  // question about what the book currently contains, so a page added since the
  // first reorder belongs in it.
  app.post("/books/:label/reading-order/reset", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    assertBookExists(safeLabel, booksDir)

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const version = storage.transaction(() => {
        assertNoActivePipelineRun(storage)
        const defaults = resolveReadingOrder(storage, { ignoreStored: true })
        const saved = storage.putNodeData(READING_ORDER_NODE, READING_ORDER_ITEM_ID, {
          schemaVersion: 1,
          items: defaults.order,
          updatedAt: new Date().toISOString(),
          sectioningGeneration: readSectioningGeneration(storage),
        })
        clearReadingOrderDependents(storage)
        return saved
      })

      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  return app
}

/**
 * What a reordering invalidates: the packaged bundle and the accessibility
 * assessment that walks it.
 *
 * Deliberately NOT the storyboard dependency chain. A reorder changes no text,
 * no catalog id and no audio, so clearing that chain would throw away the
 * user's generated speech, translations and glossary for a drag-and-drop.
 * Mirrors the `toc-generation` policy in clearRestoredNodeDependents.
 */
export function clearReadingOrderDependents(storage: Storage): void {
  storage.clearNodesByType(["accessibility-assessment"])
  storage.clearStepRuns(["package-web", "accessibility-assessment"])
}
