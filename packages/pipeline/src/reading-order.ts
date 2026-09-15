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
  PageSectioningOutput as PageSectioningOutputSchema,
  ReadingOrderOutput as ReadingOrderOutputSchema,
  READING_ORDER_NODE,
  READING_ORDER_ITEM_ID,
  withResolvedQuizIds,
  resolveQuizId,
} from "@adt/types"
import { getRenderSectioningRow } from "./render-sectioning.js"

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
   * The full order, including slots excluded from the output: sections the user
   * pruned, and sections the storyboard rendered nothing for. They keep their
   * slot, so re-including one restores it where it was rather than at the end —
   * and, more basically, so the UI has a row to offer that on at all.
   */
  order: ReadingOrderItem[]
  /** A stored order supplied the sequence (rather than the source-derived one). */
  fromStoredOrder: boolean
  /** Version of the stored entity, for optimistic saves and the version picker. */
  storedVersion: number | null
  /** How the stored order differed from the book's current contents. */
  reconcile: ReconcileResult
  /**
   * Stored rows that exist but would not parse, and were therefore not
   * honoured. Empty for a healthy book.
   *
   * Each of these failures degrades silently on its own terms — an unreadable
   * reading order leaves the book in source order, an unreadable sectioning or
   * rendering row drops a page out of the output — and every one of them is
   * indistinguishable, downstream, from the stage simply not having run. Saying
   * so is the difference between a bundle that is wrong and a bundle that is
   * wrong and nobody noticed.
   */
  unreadable: UnreadableNode[]
}

/** A stored row the resolver could not read. */
export interface UnreadableNode {
  node: string
  itemId: string
  version: number
}

export interface ResolveReadingOrderOptions {
  /** Drop quiz pages entirely (packaging with the quizzes feature disabled). */
  includeQuizzes?: boolean
  /**
   * Ignore any stored order and resolve the source-derived one instead — what
   * the book would read like if the user had never rearranged it.
   *
   * Only for offering that order back to the user ("reset to PDF order"). Every
   * consumer that asks what the book's sequence *is* must leave this off, or it
   * will silently disagree with the rest of the book.
   */
  ignoreStored?: boolean
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

function readPageContexts(storage: Storage, unreadable: UnreadableNode[]): PageContext[] {
  return storage.getPages().map((page) => {
    // Both reads below fall back to "this page has nothing", which is also what
    // a page legitimately awaiting the stage looks like. The two are
    // indistinguishable downstream, so a row that exists and will not parse is
    // recorded here — otherwise corrupt data removes a page from the book and
    // from its packaged bundle without anyone being told.
    const sectioningRow = getRenderSectioningRow(storage, page.pageId)
    const sectioning = sectioningRow
      ? PageSectioningOutputSchema.safeParse(sectioningRow.data)
      : null
    if (sectioningRow && !sectioning?.success) {
      unreadable.push({
        node: sectioningRow.node,
        itemId: page.pageId,
        version: sectioningRow.version,
      })
    }

    const row = storage.getLatestNodeData("web-rendering", page.pageId)
    const parsed = row ? WebRenderingOutputSchema.safeParse(row.data) : null
    if (row && !parsed?.success) {
      unreadable.push({ node: "web-rendering", itemId: page.pageId, version: row.version })
    }

    const rendering = parsed?.success ? [...parsed.data.sections] : []
    rendering.sort((a, b) => a.sectionIndex - b.sectionIndex)
    return {
      pageId: page.pageId,
      sections: sectioning?.success ? sectioning.data.sections : [],
      rendering,
    }
  })
}

/**
 * The source-derived order: pages by `page_number`, each page's sections in
 * `sectionIndex` order, then the quizzes anchored to that page.
 *
 * Slots come from the *sectioning* tree, never from `web-rendering`. Those two
 * disagree in one direction that matters: rendering skips a section that is
 * pruned or that has nothing renderable in it, so driving the order from
 * rendering silently loses a section's slot the moment the storyboard is
 * re-run. Which slots exist is a question about what the book contains;
 * whether a slot produces an output page is a separate one, answered by
 * `isPruned` and by whether any HTML was rendered — see `resolveReadingOrder`.
 *
 * A rendering entry with no matching sectioning row is not a slot at all: its
 * real `sectionId` is unknowable, and a positional guess could collide with a
 * live section's id. Iterating sections rather than renderings makes that
 * impossible by construction.
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
    for (const section of page.sections) {
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
 *     default-order sibling that survived. A newcomer with no surviving
 *     predecessor goes to the front of the stored order, which is what the
 *     default order says about it: nothing in the book comes before it. Note
 *     that this is the front of the *user's* sequence, not of the default one —
 *     for a book the user has reversed, "first" is still first.
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
  const unreadable: UnreadableNode[] = []
  const pageContexts = readPageContexts(storage, unreadable)

  const quizRow = storage.getLatestNodeData("quiz-generation", "book")
  const quizzes =
    options.includeQuizzes === false || !quizRow
      ? []
      : withResolvedQuizIds(quizRow.data as QuizGenerationOutput).quizzes

  const defaults = defaultReadingOrder(pageContexts, quizzes)

  // The user's explicit order, if they have set one, reconciled against what
  // the book currently contains. Reconciling here — at read time, every time —
  // rather than writing a corrected order back on every structural edit keeps
  // the entity's version history a log of deliberate reorders instead of
  // machine-generated churn, and means a bad reconcile can never be persisted.
  const storedRow = options.ignoreStored
    ? null
    : storage.getLatestNodeData(READING_ORDER_NODE, READING_ORDER_ITEM_ID)
  const stored = storedRow ? ReadingOrderOutputSchema.safeParse(storedRow.data) : null
  // A stored order that will not parse is not the same as never having been
  // reordered. Both fall back to the source-derived sequence, because there is
  // nothing else to show, but only one of them is a fault — and it is the one
  // where the user's saved arrangement is quietly not being applied.
  if (storedRow && !stored?.success) {
    unreadable.push({
      node: READING_ORDER_NODE,
      itemId: READING_ORDER_ITEM_ID,
      version: storedRow.version,
    })
  }
  const reconcile = reconcileReadingOrder(stored?.success ? stored.data.items : null, defaults)
  const order = reconcile.items

  const sectionsById = new Map<
    string,
    {
      pageId: string
      sectionIndex: number
      section: PageSectioningSection
      /** Absent when the storyboard skipped this section — pruned, or empty. */
      rendering: SectionRendering | undefined
    }
  >()
  for (const page of pageContexts) {
    const renderingByIndex = new Map(page.rendering.map((entry) => [entry.sectionIndex, entry]))
    page.sections.forEach((section, sectionIndex) => {
      sectionsById.set(section.sectionId, {
        pageId: page.pageId,
        sectionIndex,
        section,
        rendering: renderingByIndex.get(sectionIndex),
      })
    })
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
    // Both of these keep their slot in `order` but produce no output page: a
    // pruned section is deliberately out of the book, and an unrendered one has
    // no HTML to ship. Neither may be dropped from the order itself, or the
    // user loses the row that would let them put it back.
    if (!hit || hit.section.isPruned || !hit.rendering) continue
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
    unreadable,
  }
}
