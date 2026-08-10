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

  // Phase 5 inserts the stored, user-editable order here, reconciled against
  // this default. Until then the source-derived order is the only order.
  const order = defaultReadingOrder(pageContexts, quizzes)

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
  }
}
