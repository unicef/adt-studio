/**
 * Reading-order resolver — the single source of the book's output sequence.
 *
 * Before this existed, the same walk (pages by `page_number` → rendered sections
 * by `sectionIndex` → quizzes by `afterPageId`) was reimplemented in packaging,
 * in the live preview, and again for the preview's TOC and sign-language index.
 * Those copies had already drifted: one sorted sections, another didn't; one
 * renamed the first page to `index.html`, another didn't. Everything that needs
 * to know "what order are the pages in" goes through here instead, so preview
 * and export cannot disagree.
 *
 * The order is derived from source data today. Phase 5 slots a stored,
 * user-editable order in at the marked point without moving any consumer.
 */
import type { Storage } from "@adt/storage"
import type {
  PageSectioningSection,
  Quiz,
  QuizGenerationOutput,
  ReadingOrderItem,
  SectionRendering,
} from "@adt/types"
import {
  WebRenderingOutput as WebRenderingOutputSchema,
  ReadingOrderOutput as ReadingOrderOutputSchema,
  READING_ORDER_NODE,
  READING_ORDER_ITEM_ID,
  ensureQuizIds,
  resolveQuizId,
} from "@adt/types"
import { getRenderSectioning } from "./render-sectioning.js"

/** One output page, in reading order. */
export type ResolvedItem =
  | {
      kind: "section"
      /** Stable `sectionId` — also the bundle filename stem. */
      id: string
      /** Source page that owns this section. Provenance, not position. */
      pageId: string
      /** Array position within the page's sectioning / rendering — a lookup key. */
      sectionIndex: number
      section: PageSectioningSection
      rendering: SectionRendering
      /** Printed page number from the source PDF, when known. */
      pageNumber: number | null
    }
  | {
      kind: "quiz"
      /** Stable `quizId` — also the bundle filename stem. */
      id: string
      quiz: Quiz
      /** Array position in `quiz-generation.quizzes` — the catalog-id lookup key. */
      quizIndex: number
    }

export interface ResolvedReadingOrder {
  /** The output sequence. pages.json order, spine order, nav order. */
  items: ResolvedItem[]
  /**
   * 1-based output position by item id. Replaces the ad-hoc `sectionIdToPageIndex`
   * maps that consumers used to rebuild by walking the book a second time.
   */
  positionById: Map<string, number>
  /**
   * The full order including items excluded from the output — currently the
   * pruned ones. They keep their slot, so re-including an item restores it
   * where it was rather than at the end.
   */
  order: ReadingOrderItem[]
  /** A stored order supplied the sequence (rather than the source-derived one). */
  fromStoredOrder: boolean
  /** Version of the stored entity, for optimistic saves and the version picker. */
  storedVersion: number | null
  /** How the stored order differed from the book's current contents. */
  reconcile: ReconcileResult
}

export interface ResolveReadingOrderOptions {
  /** Drop quiz pages entirely (packaging with the quizzes feature disabled). */
  includeQuizzes?: boolean
}

/** The `content/pages.json` entry shape, built in exactly one place. */
export interface PageEntry {
  section_id: string
  href: string
  page_number?: number
}

/**
 * Source pages in the order the reader meets them, each appearing once, at the
 * position of its first section.
 *
 * For anything that groups or counts *pages* in reading sequence — quiz
 * batching, "every N pages" placement. Using `storage.getPages()` for that
 * instead silently means "in source-PDF order", which stops matching the book
 * the moment the user reorders it.
 *
 * Pages whose sections have been split apart by a reorder collapse to their
 * first appearance; page-granular consumers cannot express more than that.
 */
export function readingOrderPageIds(resolved: ResolvedReadingOrder): string[] {
  const seen = new Set<string>()
  const pageIds: string[] = []
  for (const item of resolved.items) {
    if (item.kind !== "section") continue
    if (seen.has(item.pageId)) continue
    seen.add(item.pageId)
    pageIds.push(item.pageId)
  }
  return pageIds
}

/** Bundle filename / preview route for an item. Always id-based, never positional. */
export function readingOrderHref(item: ResolvedItem): string {
  return `${item.id}.html`
}

export function toPageEntry(item: ResolvedItem): PageEntry {
  const entry: PageEntry = { section_id: item.id, href: readingOrderHref(item) }
  if (item.kind === "section" && item.pageNumber !== null) {
    entry.page_number = item.pageNumber
  }
  return entry
}

/** Everything the resolver reads per page, gathered once. */
interface PageContext {
  pageId: string
  sections: PageSectioningSection[]
  /** Rendered entries, ascending by `sectionIndex`. */
  rendering: SectionRendering[]
}

function readPageContexts(storage: Storage): PageContext[] {
  return storage.getPages().map((page) => {
    const sectioning = getRenderSectioning(storage, page.pageId)
    const row = storage.getLatestNodeData("web-rendering", page.pageId)
    const parsed = row ? WebRenderingOutputSchema.safeParse(row.data) : null
    const rendering = parsed?.success ? [...parsed.data.sections] : []
    rendering.sort((a, b) => a.sectionIndex - b.sectionIndex)
    return { pageId: page.pageId, sections: sectioning?.sections ?? [], rendering }
  })
}

/**
 * The source-derived order: pages by `page_number`, each page's rendered
 * sections by `sectionIndex`, then the quizzes anchored to that page.
 *
 * Emits pruned sections too — reading order tracks slots, and whether a slot is
 * *shown* is a separate question answered by `isPruned`. Rendering entries with
 * no matching sectioning row are dropped: their real `sectionId` is unknowable,
 * and a positional guess could collide with a live section's id.
 */
export function defaultReadingOrder(
  pageContexts: PageContext[],
  quizzes: Quiz[]
): ReadingOrderItem[] {
  const quizzesByAfterPageId = new Map<string, Array<{ quiz: Quiz; index: number }>>()
  quizzes.forEach((quiz, index) => {
    const list = quizzesByAfterPageId.get(quiz.afterPageId) ?? []
    list.push({ quiz, index })
    quizzesByAfterPageId.set(quiz.afterPageId, list)
  })

  const items: ReadingOrderItem[] = []
  for (const page of pageContexts) {
    for (const entry of page.rendering) {
      const section = page.sections[entry.sectionIndex]
      if (!section) continue
      items.push({ kind: "section", id: section.sectionId })
    }
    for (const { quiz, index } of quizzesByAfterPageId.get(page.pageId) ?? []) {
      items.push({ kind: "quiz", id: resolveQuizId(quiz, index) })
    }
  }
  return items
}

export interface ReconcileResult {
  /** The effective order after folding the book's current contents in. */
  items: ReadingOrderItem[]
  /** Stored ids that no longer exist in the book. */
  dropped: ReadingOrderItem[]
  /** Ids new to the book, with the surviving item they were placed after. */
  added: Array<{ item: ReadingOrderItem; afterId: string | null }>
  /** `items` differs from what was stored. */
  changed: boolean
}

/**
 * Fold the book's current contents into a stored reading order.
 *
 * Rules:
 *  1. No stored order → the default order, unchanged.
 *  2. Stored ids the book no longer has are dropped. They are *not* kept as
 *     tombstones: `node_data` history already is one, so restoring an earlier
 *     version brings the exact prior list back, and if the item is genuinely
 *     gone the next reconcile drops it again. A live tombstone list would grow
 *     without bound and need a GC policy.
 *  3. Ids the book has but the stored order does not are inserted at their
 *     *default-order neighbourhood* — immediately after the nearest preceding
 *     default-order sibling that survived, else before the nearest following
 *     one, else appended.
 *
 *     This rule is why clone, split, "new page extracted" and "quiz added" need
 *     no reading-order code of their own: a clone's default position is right
 *     after its original, so that is where it lands. Appending to the end would
 *     be wrong for every one of them.
 *  4. Duplicates in the stored order: the first occurrence wins.
 *
 * Pure and idempotent — reconciling a reconciled order changes nothing.
 */
export function reconcileReadingOrder(
  storedItems: readonly ReadingOrderItem[] | null,
  defaultItems: readonly ReadingOrderItem[]
): ReconcileResult {
  if (!storedItems) {
    return { items: [...defaultItems], dropped: [], added: [], changed: false }
  }

  const availableById = new Map(defaultItems.map((item) => [item.id, item]))

  const kept: ReadingOrderItem[] = []
  const dropped: ReadingOrderItem[] = []
  const seen = new Set<string>()
  for (const item of storedItems) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const available = availableById.get(item.id)
    if (available) kept.push(available)
    else dropped.push(item)
  }

  // Walk the default order and slot in anything the stored order didn't have,
  // tracking the last surviving item seen so newcomers land beside the sibling
  // they were created next to.
  const items = [...kept]
  const added: ReconcileResult["added"] = []
  let lastSurvivingId: string | null = null
  for (const item of defaultItems) {
    if (seen.has(item.id)) {
      lastSurvivingId = item.id
      continue
    }
    const at =
      lastSurvivingId === null
        ? 0
        : items.findIndex((existing) => existing.id === lastSurvivingId) + 1
    items.splice(at, 0, item)
    added.push({ item, afterId: lastSurvivingId })
    // Subsequent newcomers in the same gap keep their relative order.
    lastSurvivingId = item.id
    seen.add(item.id)
  }

  const changed =
    dropped.length > 0 ||
    added.length > 0 ||
    items.length !== storedItems.length ||
    items.some((item, index) => item.id !== storedItems[index]?.id)

  return { items, dropped, added, changed }
}

/**
 * Resolve the book's output sequence.
 *
 * Pruned items are omitted from `items` — they exist in the book but not in the
 * output — while keeping their slot in the underlying order, so un-pruning
 * restores an item exactly where it was.
 */
export function resolveReadingOrder(
  storage: Storage,
  options: ResolveReadingOrderOptions = {}
): ResolvedReadingOrder {
  const pageContexts = readPageContexts(storage)

  const quizRow = storage.getLatestNodeData("quiz-generation", "book")
  const quizzes =
    options.includeQuizzes === false || !quizRow
      ? []
      : ensureQuizIds(quizRow.data as QuizGenerationOutput).output.quizzes

  const defaults = defaultReadingOrder(pageContexts, quizzes)

  // The user's explicit order, if they have set one, reconciled against what
  // the book currently contains. Reconciling here — at read time, every time —
  // rather than writing a corrected order back on every structural edit keeps
  // the entity's version history a log of deliberate reorders instead of
  // machine-generated churn, and means a bad reconcile can never be persisted.
  const storedRow = storage.getLatestNodeData(READING_ORDER_NODE, READING_ORDER_ITEM_ID)
  const stored = storedRow ? ReadingOrderOutputSchema.safeParse(storedRow.data) : null
  const reconcile = reconcileReadingOrder(stored?.success ? stored.data.items : null, defaults)
  const order = reconcile.items

  const sectionsById = new Map<
    string,
    { pageId: string; sectionIndex: number; section: PageSectioningSection; rendering: SectionRendering }
  >()
  for (const page of pageContexts) {
    for (const entry of page.rendering) {
      const section = page.sections[entry.sectionIndex]
      if (!section) continue
      sectionsById.set(section.sectionId, {
        pageId: page.pageId,
        sectionIndex: entry.sectionIndex,
        section,
        rendering: entry,
      })
    }
  }
  const quizzesById = new Map(
    quizzes.map((quiz, index) => [resolveQuizId(quiz, index), { quiz, index }])
  )

  const items: ResolvedItem[] = []
  for (const entry of order) {
    if (entry.kind === "quiz") {
      const hit = quizzesById.get(entry.id)
      if (!hit) continue
      items.push({ kind: "quiz", id: entry.id, quiz: hit.quiz, quizIndex: hit.index })
      continue
    }
    const hit = sectionsById.get(entry.id)
    if (!hit || hit.section.isPruned) continue
    items.push({
      kind: "section",
      id: entry.id,
      pageId: hit.pageId,
      sectionIndex: hit.sectionIndex,
      section: hit.section,
      rendering: hit.rendering,
      pageNumber: hit.section.pageNumber,
    })
  }

  return {
    items,
    positionById: new Map(items.map((item, index) => [item.id, index + 1])),
    order,
    fromStoredOrder: Boolean(stored?.success),
    storedVersion: storedRow?.version ?? null,
    reconcile,
  }
}
