import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  parseBookLabel,
  ReadingOrderItem,
  READING_ORDER_NODE,
  READING_ORDER_ITEM_ID,
} from "@adt/types"
import { createBookStorage, type Storage } from "@adt/storage"
import { resolveReadingOrder, readingOrderHref } from "@adt/pipeline"

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
 * A pipeline step writing sectioning or rendering mid-save would change what the
 * order refers to underneath us. Refuse rather than persist an order built from
 * a book that is being rewritten.
 */
function assertNoActivePipelineRun(storage: Storage): void {
  const running = storage
    .getStepRuns()
    .filter((run) => run.status === "running")
    .map((run) => run.step)
  if (running.length === 0) return
  throw new HTTPException(409, {
    message: `Cannot change the reading order while pipeline steps are running: ${running.join(", ")}. Wait for the run to finish or cancel it first.`,
  })
}

export function createReadingOrderRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/reading-order — the resolved sequence plus what a stored
  // order (if any) no longer lines up with.
  app.get("/books/:label/reading-order", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const resolved = resolveReadingOrder(storage)
      return c.json({
        version: resolved.storedVersion,
        fromStoredOrder: resolved.fromStoredOrder,
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

      const version = storage.putNodeData(READING_ORDER_NODE, READING_ORDER_ITEM_ID, {
        schemaVersion: 1,
        items: parsed.data.items,
        updatedAt: new Date().toISOString(),
      })
      clearReadingOrderDependents(storage)

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
