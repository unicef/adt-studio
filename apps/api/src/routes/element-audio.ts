import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  ELEMENT_AUDIO_NODE,
  ElementAudioEntry,
  ElementAudioOutput,
  isElementAudioNodeId,
  parseBookLabel,
} from "@adt/types"
import { buildElementLocationIndex } from "@adt/pipeline"
import { createBookStorage, type PageData, type Storage } from "@adt/storage"

/** The client sends `sourcePageId` as a hint: it is ignored for an existing
 *  entry (the canonical row wins) and must name the current page for a new one. */
const ElementAudioPutEntry = z
  .object({
    nodeId: z.string().min(1),
    text: z.string(),
    sourcePageId: z.string().min(1),
  })
  .strict()

const ElementAudioPutBody = z
  .object({
    /** One base version per source row. A page view can merge entries authored
     *  under several pages after images move (SPEC-0014 R-14, R-20). */
    versions: z.record(z.string(), z.number().int().positive()),
    entries: z.array(ElementAudioPutEntry),
  })
  .strict()

interface StoredRow {
  pageId: string
  version: number
  entries: ElementAudioEntry[]
}

interface PageViewEntry {
  nodeId: string
  text: string
  sourcePageId: string
}

interface PageView {
  pageId: string
  versions: Record<string, number>
  entries: PageViewEntry[]
}

/** Reads the row leniently: a bad or legacy entry must not hide the rest of
 *  the page. First-wins keeps reads deterministic (SPEC-0014 AC-26). */
function readEntries(data: unknown): ElementAudioEntry[] {
  const entries = (data as { entries?: unknown } | null)?.entries
  if (!Array.isArray(entries)) return []
  const seen = new Set<string>()
  const result: ElementAudioEntry[] = []
  for (const candidate of entries) {
    const parsed = ElementAudioEntry.safeParse(candidate)
    if (!parsed.success || seen.has(parsed.data.nodeId)) continue
    seen.add(parsed.data.nodeId)
    result.push(parsed.data)
  }
  return result
}

function readRows(storage: Storage): Map<string, StoredRow> {
  const rows = new Map<string, StoredRow>()
  for (const pageId of storage.getNodeItemIds(ELEMENT_AUDIO_NODE)) {
    const row = storage.getLatestNodeData(ELEMENT_AUDIO_NODE, pageId)
    if (!row) continue
    rows.set(pageId, { pageId, version: row.version, entries: readEntries(row.data) })
  }
  return rows
}

function sourceRowsFor(rows: Map<string, StoredRow>, nodeId: string): StoredRow[] {
  return [...rows.values()].filter((row) => row.entries.some((entry) => entry.nodeId === nodeId))
}

function currentVersions(rows: Map<string, StoredRow>): Record<string, number> {
  return Object.fromEntries([...rows.values()].map((row) => [row.pageId, row.version]))
}

/** The inspector lists the elements in the order they render on the page.
 *  The page's own row version is always part of the save baseline, even when
 *  all of its entries are currently orphaned or pruned: a new entry is written
 *  to that row. */
function buildPageView(
  storage: Storage,
  pageId: string,
  pages: PageData[],
  rows: Map<string, StoredRow>,
  locations?: ReadonlyMap<string, { pageId: string }>,
): PageView {
  const versions = new Map<string, number>()
  const entries: PageViewEntry[] = []

  const own = rows.get(pageId)
  if (own) versions.set(pageId, own.version)

  const hasEntries = [...rows.values()].some((row) => row.entries.length > 0)
  if (hasEntries) {
    for (const [nodeId, location] of locations ?? buildElementLocationIndex(storage, pages)) {
      if (location.pageId !== pageId) continue
      const source = sourceRowsFor(rows, nodeId)[0]
      if (!source) continue
      const entry = source.entries.find((candidate) => candidate.nodeId === nodeId)
      if (!entry) continue
      versions.set(source.pageId, source.version)
      entries.push({ nodeId, text: entry.text, sourcePageId: source.pageId })
    }
  }

  return { pageId, versions: Object.fromEntries(versions), entries }
}

/** Applies a same-version save: every submitted entry is authoritative. */
function applySubmitted(
  current: ElementAudioEntry[],
  submitted: PageViewEntry[],
): ElementAudioEntry[] | undefined {
  const next = [...current]
  let changed = false
  for (const entry of submitted) {
    const index = next.findIndex((candidate) => candidate.nodeId === entry.nodeId)
    if (index >= 0) {
      if (next[index].text === entry.text) continue
      next[index] = { nodeId: entry.nodeId, text: entry.text }
    } else {
      next.push({ nodeId: entry.nodeId, text: entry.text })
    }
    changed = true
  }
  return changed ? next : undefined
}

class ElementAudioConflict extends Error {
  constructor(
    message: string,
    readonly versions: Record<string, number>,
    readonly code = "element-audio-conflict",
  ) {
    super(message)
  }
}

/**
 * Merge-on-stale for one source row. The submitted entry is applied only when
 * the client changed it and the saved row did not; the same `nodeId` changed on
 * both sides is a conflict. Entries the client did not send are preserved.
 */
function mergeStaleRow(
  storage: Storage,
  current: StoredRow,
  expectedVersion: number | undefined,
  submitted: PageViewEntry[],
  rows: Map<string, StoredRow>,
): ElementAudioEntry[] | undefined {
  const conflict = (message: string): never => {
    throw new ElementAudioConflict(message, currentVersions(rows))
  }

  let baseline: Map<string, string>
  if (expectedVersion === undefined) {
    // The client loaded the page before this row existed. An empty baseline
    // still merges disjoint additions and conflicts on the same nodeId.
    baseline = new Map()
  } else {
    if (expectedVersion > current.version) {
      conflict("Element audio changed since it was loaded. Refresh before saving.")
    }
    const baselineRow = storage
      .getAllNodeVersions(ELEMENT_AUDIO_NODE, current.pageId)
      .find((row) => row.version === expectedVersion)
    if (!baselineRow || baselineRow.data === null) {
      throw new ElementAudioConflict(
        "Element audio changed since it was loaded. Refresh before saving.",
        currentVersions(rows),
      )
    }
    baseline = new Map(readEntries(baselineRow.data).map((entry) => [entry.nodeId, entry.text]))
  }

  const saved = new Map(current.entries.map((entry) => [entry.nodeId, entry.text]))
  const next = [...current.entries]
  let changed = false
  for (const entry of submitted) {
    const before = baseline.get(entry.nodeId)
    const now = saved.get(entry.nodeId)
    // Unchanged locally or unchanged remotely: keep the saved value.
    if (now === entry.text || before === entry.text) continue
    if (before !== now) {
      conflict(`Element audio for ${entry.nodeId} changed in another editor. Refresh before saving.`)
    }
    const index = next.findIndex((candidate) => candidate.nodeId === entry.nodeId)
    if (index >= 0) next[index] = { nodeId: entry.nodeId, text: entry.text }
    else next.push({ nodeId: entry.nodeId, text: entry.text })
    changed = true
  }
  return changed ? next : undefined
}

function assertPage(pages: PageData[], pageId: string): void {
  if (!pages.some((page) => page.pageId === pageId)) {
    throw new HTTPException(404, { message: `Page not found: ${pageId}` })
  }
}

function dbPathFor(booksDir: string, label: string): string {
  return path.join(path.resolve(booksDir), label, `${label}.db`)
}

function bookDbExists(booksDir: string, label: string): boolean {
  try {
    return fs.statSync(dbPathFor(booksDir, label)).isFile()
  } catch {
    return false
  }
}

/**
 * SPEC-0014: authored per-element scripts. The artifact is keyed by the page it
 * was authored under, while a page's `GET` resolves the elements it currently
 * renders across every row (page membership). Saves are immediate and always
 * create a new version (Core Principle 2).
 */
export function createElementAudioRoutes(booksDir: string): Hono {
  const app = new Hono()

  app.get("/books/:label/pages/:pageId/element-audio", (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    if (!bookDbExists(booksDir, safeLabel)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      return storage.readSnapshot(() => {
        const pages = storage.getPages()
        assertPage(pages, pageId)
        return c.json(buildPageView(storage, pageId, pages, readRows(storage)))
      })
    } finally {
      storage.close()
    }
  })

  app.put("/books/:label/pages/:pageId/element-audio", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const parsed = ElementAudioPutBody.safeParse(await c.req.json().catch(() => undefined))
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid element audio: ${parsed.error.message}`,
      })
    }
    if (!bookDbExists(booksDir, safeLabel)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      try {
        return storage.transaction(() => {
          const pages = storage.getPages()
          assertPage(pages, pageId)
          const rows = readRows(storage)

          const seen = new Set<string>()
          for (const entry of parsed.data.entries) {
            if (seen.has(entry.nodeId)) {
              throw new HTTPException(400, {
                message: `Duplicate nodeId in element audio: ${entry.nodeId}`,
              })
            }
            seen.add(entry.nodeId)
          }

          // Resolve each submitted entry to the row that authored it. A stale
          // `sourcePageId` is only a hint: the canonical row wins, so authoring
          // a moved element under its new page merges instead of forking.
          const groups = new Map<string, PageViewEntry[]>()
          let locations: Map<string, { pageId: string }> | undefined
          for (const entry of parsed.data.entries) {
            const sources = sourceRowsFor(rows, entry.nodeId)
            if (sources.length > 1) {
              throw new ElementAudioConflict(
                `Element ${entry.nodeId} is authored under multiple pages (${sources
                  .map((source) => source.pageId)
                  .join(", ")}). Resolve the duplicate before saving.`,
                currentVersions(rows),
                "element-audio-duplicate",
              )
            }
            if (sources.length === 1) {
              const group = groups.get(sources[0].pageId) ?? []
              group.push(entry)
              groups.set(sources[0].pageId, group)
              continue
            }

            // A6: creating a script is image-only in v1 (SPEC-0014 R-2). An
            // existing entry stays editable even if a legacy row holds a
            // non-image id, so a full-array save cannot get stuck.
            if (!isElementAudioNodeId(entry.nodeId)) {
              throw new HTTPException(400, {
                message: `Element audio is image-only in v1: ${entry.nodeId}`,
              })
            }
            // A new script is authored under the page it is being written on.
            if (entry.sourcePageId !== pageId) {
              throw new HTTPException(400, {
                message: `New element audio for ${entry.nodeId} must be authored under the current page ${pageId}.`,
              })
            }
            locations ??= buildElementLocationIndex(storage, pages)
            if (locations.get(entry.nodeId)?.pageId !== pageId) {
              throw new HTTPException(400, {
                message: `Element ${entry.nodeId} is not rendered on page ${pageId}.`,
              })
            }
            const group = groups.get(pageId) ?? []
            group.push(entry)
            groups.set(pageId, group)
          }

          const writes: Array<{ pageId: string; entries: ElementAudioEntry[] }> = []
          for (const [sourcePageId, submitted] of groups) {
            const current = rows.get(sourcePageId)
            const expectedVersion = Object.prototype.hasOwnProperty.call(
              parsed.data.versions,
              sourcePageId,
            )
              ? parsed.data.versions[sourcePageId]
              : undefined
            if (!current) {
              if (expectedVersion !== undefined) {
                throw new ElementAudioConflict(
                  `Element audio for page ${sourcePageId} no longer exists. Refresh before saving.`,
                  currentVersions(rows),
                )
              }
              writes.push({
                pageId: sourcePageId,
                entries: submitted.map(({ nodeId, text }) => ({ nodeId, text })),
              })
              continue
            }
            const next =
              expectedVersion === current.version
                ? applySubmitted(current.entries, submitted)
                : mergeStaleRow(storage, current, expectedVersion, submitted, rows)
            if (next) writes.push({ pageId: sourcePageId, entries: next })
          }

          const generatedAt = new Date().toISOString()
          for (const write of writes) {
            const data = { entries: write.entries, generatedAt }
            ElementAudioOutput.parse(data)
            storage.putNodeData(ELEMENT_AUDIO_NODE, write.pageId, data)
          }

          const nextRows = writes.length > 0 ? readRows(storage) : rows
          return c.json(buildPageView(storage, pageId, pages, nextRows, locations))
        })
      } catch (err) {
        if (err instanceof ElementAudioConflict) {
          return c.json(
            { error: err.message, code: err.code, versions: err.versions },
            409,
          )
        }
        throw err
      }
    } finally {
      storage.close()
    }
  })

  return app
}
