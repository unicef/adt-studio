import { useMemo } from "react"
import { buildSlides, slideId, type Slide } from "@/lib/slide-sequence"
import { usePages } from "./use-pages"
import { useQuizzes } from "./use-quizzes"
import { useReadingOrder } from "./use-reading-order"
import { useReadingOrderDraft } from "./use-reading-order-draft"

export { slideId, type Slide }

/**
 * The book's slides, in the order the reader meets them.
 *
 * One sequence, shared by the page list and by navigation. They used to be
 * different lists: the sidebar was built from the reading order while the
 * keyboard and toolbar arrows walked `usePages()` — source-PDF order — and went
 * blind on a quiz entirely. So in a reordered book the arrows moved somewhere
 * other than the row below the one highlighted beside them.
 *
 * Draft-aware by construction, so while a rearrangement is pending the arrows
 * follow the order the user is looking at rather than the one on the server.
 * Which slots reach the reader is still the server's answer: the draft
 * resequences the same slots, it does not decide what is in them.
 */
export function useSlideSequence(bookLabel: string) {
  const { data: pages } = usePages(bookLabel)
  const { data: quizzesData } = useQuizzes(bookLabel)
  const { data: readingOrder } = useReadingOrder(bookLabel)
  const { draft } = useReadingOrderDraft()

  const effectiveOrder = useMemo(
    () => draft ?? readingOrder?.order ?? [],
    [draft, readingOrder],
  )

  const renderedIds = useMemo(
    () => (readingOrder ? new Set(readingOrder.items.map((item) => item.id)) : undefined),
    [readingOrder],
  )

  const slides = useMemo(
    () => buildSlides(pages, quizzesData?.quizzes?.quizzes, renderedIds, effectiveOrder),
    [pages, quizzesData, renderedIds, effectiveOrder],
  )

  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    slides.forEach((slide, index) => map.set(slideId(slide), index))
    return map
  }, [slides])

  return { slides, indexById, effectiveOrder, readingOrder }
}
