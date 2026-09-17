import { resolveQuizId, type Quiz } from "@adt/types"
import type { PageSummaryItem, PageSummarySection, ReadingOrderEntry } from "@/api/client"

/**
 * One slide of the book: a storyboard section or a quiz, in reading order.
 *
 * `position` is the book page the reader sees, and is null for a slot that
 * produces no output page — one the user removed from the book, or one the
 * storyboard has not rendered. Those keep their place in the sequence so the
 * sidebar can show where they sit and offer them back.
 */
export type Slide = { position: number | null } & (
  | { kind: "section"; page: PageSummaryItem; section: PageSummarySection }
  | { kind: "quiz"; page: PageSummaryItem; quiz: Quiz; quizId: string }
)

/** The slide's stable id — the thing every other part of the app keys on. */
export function slideId(slide: Slide): string {
  return slide.kind === "section" ? slide.section.sectionId : slide.quizId
}

/**
 * Fold the book's contents into the reading order.
 *
 * Pure so the sequencing can be tested without a query client: every
 * interesting case here — a quiz between two sections, a slot the sidebar
 * cannot resolve, a removed page keeping its place but taking no book-page
 * number — is a question about these four inputs and nothing else.
 */
export function buildSlides(
  pages: readonly PageSummaryItem[] | undefined,
  quizzes: readonly Quiz[] | undefined,
  renderedIds: ReadonlySet<string> | undefined,
  order: readonly ReadingOrderEntry[],
): Slide[] {
  if (!pages || !renderedIds) return []

  const sectionById = new Map<string, { page: PageSummaryItem; section: PageSummarySection }>()
  for (const page of pages) {
    for (const section of page.sections) sectionById.set(section.sectionId, { page, section })
  }
  const quizById = new Map<string, { quiz: Quiz; page: PageSummaryItem }>()
  const pageById = new Map(pages.map((page) => [page.pageId, page]))
  // The API resolves legacy ids before returning quizzes, so `quizId` is
  // populated in practice; `resolveQuizId` keeps this total without a
  // non-null assertion, since the type still allows it to be absent.
  ;(quizzes ?? []).forEach((quiz, i) => {
    const page = pageById.get(quiz.afterPageId)
    if (page) quizById.set(resolveQuizId(quiz, i), { quiz, page })
  })

  let bookPage = 0
  return order.flatMap<Slide>((entry) => {
    const position = renderedIds.has(entry.id) ? ++bookPage : null
    if (entry.kind === "quiz") {
      const hit = quizById.get(entry.id)
      return hit
        ? [{ kind: "quiz", page: hit.page, quiz: hit.quiz, quizId: entry.id, position }]
        : []
    }
    const hit = sectionById.get(entry.id)
    return hit ? [{ kind: "section", page: hit.page, section: hit.section, position }] : []
  })
}

/** Where the current slide sits in the sequence, or -1 if it is not in it. */
export function findSlideIndex(
  slides: readonly Slide[],
  selection: { quizId?: string | null; sectionId?: string | null },
): number {
  const id = selection.quizId ?? selection.sectionId
  if (!id) return -1
  return slides.findIndex((slide) => slideId(slide) === id)
}

/** How to address a slide: a quiz borrows the page slot, a section needs both. */
export type SlideTarget =
  | { kind: "quiz"; quizId: string }
  | { kind: "section"; pageId: string; sectionId: string }

export function slideTarget(slide: Slide): SlideTarget {
  return slide.kind === "quiz"
    ? { kind: "quiz", quizId: slide.quizId }
    : { kind: "section", pageId: slide.page.pageId, sectionId: slide.section.sectionId }
}

/**
 * The slide one step away, or null at either end of the book.
 *
 * A step is one slide in reading order, not one section within a page and then
 * one page: those are the same thing only in a book nobody has rearranged, and
 * the second skips quizzes entirely because they belong to no page.
 */
export function stepSlide(
  slides: readonly Slide[],
  currentIndex: number,
  delta: -1 | 1,
): SlideTarget | null {
  if (currentIndex < 0) return null
  const target = slides[currentIndex + delta]
  return target ? slideTarget(target) : null
}

/**
 * What to do with a section index a structural edit asked us to open.
 *
 * The edit names its target by position in the tree it just produced, which the
 * view has not received when the call arrives. Resolving against the sections
 * still in hand names the wrong section (delete the middle of three, and index
 * 1 is the one just removed) or none at all (clone the last of three, and index
 * 3 is off the end). So the answer is "wait" until the tree actually changes.
 *
 * Identity, not length: a merge and a delete both shorten the array, but a
 * same-length replacement — an edit that swaps a section's content — still has
 * to be waited for.
 */
export function resolveStructuralTarget(
  sections: readonly { sectionId: string }[],
  before: readonly unknown[],
  index: number,
): { wait: true } | { wait: false; sectionId: string | null } {
  if (sections === before) return { wait: true }
  // A section removed from the end leaves the index past the new end; the last
  // section is the nearest thing to where the user was standing.
  const target = sections[index] ?? sections[sections.length - 1]
  return { wait: false, sectionId: target?.sectionId ?? null }
}
