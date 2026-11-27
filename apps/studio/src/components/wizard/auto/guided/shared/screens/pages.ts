import { useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { RENDER_STRATEGIES } from "@/components/wizard/core/constants"
import type { Device, Shown } from "./layouts"

const THUMB = 520

/**
 * Which PDF pages a screen shows: one page, or a pair of facing pages when Page Grouping is Spread.
 * A PDF that already stores both pages on one wide page shows that one page either way.
 */
export function screenPages(rec: SetupRecommendation | null, grouping: string | undefined, page: number): number[] {
  if (grouping !== "spread" || !rec || rec.measured.pageStorage === "spreads-as-wide-pages") return [page]
  const ev = rec.measured.pageStorageEvidence
  const pair = ev.findIndex((p, i) => ev[i + 1] === p + 1 && (p === page || p + 1 === page))
  const left = pair >= 0 ? ev[pair] : page + 1 > rec.pageCount ? page - 1 : page
  return [left, left + 1]
}

/** The page images for a screen (rendered in the browser, cached per file). */
export function useScreenImages(file: File | null | undefined, pages: number[]): (string | undefined)[] {
  const a = usePageThumb(file, pages[0] ?? 0, THUMB)
  const b = usePageThumb(file, pages[1] ?? 0, THUMB)
  return pages.length === 2 ? [a, b] : [a]
}

/** The text equivalent of a preview, for screen readers. */
export function useDescribe() {
  const { t, i18n } = useLingui()
  return (shown: Shown, device: Device, pages: number[]) => {
    // Whole sentences per case (not "your {where}" fragments), so every language can make the words agree.
    const on = device === "desktop" ? t`on a computer` : t`on a phone`
    const [a, b] = pages
    const two = pages.length === 2
    if (shown.renderStrategy === "raw") return two ? t`Pages ${a} and ${b} as printed, joined into one screen ${on}, while I read the book.` : t`Page ${a} as printed, ${on}, while I read the book.`
    const choice = RENDER_STRATEGIES.find((s) => s.id === shown.renderStrategy)
    const strategy = choice ? i18n._(choice.title) : shown.renderStrategy
    const split = shown.sectioningMode === "dynamic"
    const picture = two
      ? split
        ? t`Pages ${a} and ${b} joined into one screen ${on}, laid out as “${strategy}” and split into parts.`
        : t`Pages ${a} and ${b} joined into one screen ${on}, laid out as “${strategy}” and kept whole.`
      : split
        ? t`Page ${a} ${on}, laid out as “${strategy}” and split into parts.`
        : t`Page ${a} ${on}, laid out as “${strategy}” and kept whole.`
    const sentences = [
      picture,
      shown.activitiesGenerator ? t`It has an interactive activity.` : null,
      shown.figureExtraction === "auto" ? t`Pictures are kept together with their labels.` : null,
    ]
    return sentences.filter(Boolean).join(" ")
  }
}
