import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { PageDetail } from "@/api/client"

export interface CaptionMock {
  synthetic?: boolean
  blank?: number
  decorative?: number
  clear?: boolean
  noImages?: boolean
}

interface CaptionPageLike {
  pageId: string
  captionCount?: number
  uncaptionedCount?: number
  decorativeCount?: number
  hasCaptioning: boolean
  imageCount: number
  [key: string]: unknown
}

const SAMPLES = [
  msg`A man in a bowler hat and a dark suit walks briskly, carrying a suitcase in one hand and a basket in the other.`,
  msg`Two men sit on a bench under a small roof; one plays the guitar while the other listens.`,
  msg`An orange tram crowded with passengers moves along a city street.`,
  msg`A woman in a long dress stands at a window, looking out at the street below.`,
  msg`A cover in bright orange with the book's title in large black letters and a small drawing of a walking man.`,
  msg`A quiet street of low houses with tiled roofs and a tall palm tree on the corner.`,
]

const LONG = msg`Under the warm light of a single candle, a man in an old armchair reads a thick book, surrounded by shelves full of books and bottles; through the window behind him, two neighbours lean in to watch, their faces half in shadow, while the night outside is painted in deep blue strokes that frame the whole scene.`

const LONG_PAGES = new Set(["pg012013", "pg016017"])

function plan(pages: readonly CaptionPageLike[], mock: CaptionMock) {
  const captioned = pages.filter((page) => (page.captionCount ?? 0) > 0).map((page) => page.pageId)
  const blank = new Set(captioned.slice(0, mock.blank ?? 0))
  const decorative = new Set(captioned.slice(mock.blank ?? 0, (mock.blank ?? 0) + (mock.decorative ?? 0)))
  return { blank, decorative }
}

const planned = new Map<string, { blank: Set<string>; decorative: Set<string> }>()

export function keptImageIds(page: PageDetail): string[] {
  return (page.imageClassification?.images ?? []).filter((image) => !image.isPruned && !image.imageId.endsWith("_page")).map((image) => image.imageId)
}

export function mockCaptionPages(book: string, pages: CaptionPageLike[], mock: CaptionMock, kept: ReadonlyMap<string, number> = new Map()): CaptionPageLike[] {
  if (mock.noImages) return pages.map((page) => ({ ...page, imageCount: 0, captionCount: 0, uncaptionedCount: 0, decorativeCount: 0, hasCaptioning: false }))
  if (mock.clear) return pages.map((page) => ({ ...page, captionCount: 0, uncaptionedCount: 0, decorativeCount: 0, hasCaptioning: false }))
  const base = mock.synthetic
    ? pages.map((page) =>
        (kept.get(page.pageId) ?? 0) > 0
          ? { ...page, captionCount: kept.get(page.pageId) ?? 0, uncaptionedCount: 0, decorativeCount: 0, hasCaptioning: true }
          : { ...page, captionCount: 0, uncaptionedCount: 0, decorativeCount: 0, hasCaptioning: false },
      )
    : pages
  const sets = plan(base, mock)
  planned.set(book, sets)
  return base.map((page) =>
    sets.blank.has(page.pageId)
      ? { ...page, uncaptionedCount: page.captionCount ?? 0, decorativeCount: 0 }
      : sets.decorative.has(page.pageId)
        ? { ...page, decorativeCount: page.captionCount ?? 0, uncaptionedCount: 0 }
        : page,
  )
}

function syntheticCaptions(page: PageDetail): NonNullable<PageDetail["imageCaptioning"]> {
  const ids = keptImageIds(page)
  const seed = page.pageNumber
  return {
    captions: ids.map((imageId, index) => ({
      imageId,
      reasoning: "",
      caption: i18n._(LONG_PAGES.has(page.pageId) && index === Math.min(1, ids.length - 1) ? LONG : SAMPLES[(seed + index) % SAMPLES.length]),
      decorative: false,
      source: "ai" as const,
    })),
  }
}

export function mockCaptionPage(book: string, page: PageDetail, mock: CaptionMock): PageDetail {
  if (mock.clear || mock.noImages) return { ...page, imageCaptioning: null }
  const base: PageDetail = mock.synthetic
    ? { ...page, imageCaptioning: syntheticCaptions(page), versions: { ...page.versions, imageCaptioning: page.versions.imageCaptioning ?? 1 } }
    : page
  const sets = planned.get(book)
  if (!sets || !base.imageCaptioning) return base
  const blank = sets.blank.has(page.pageId)
  const decorative = sets.decorative.has(page.pageId)
  if (!blank && !decorative) return base
  return {
    ...base,
    imageCaptioning: {
      ...base.imageCaptioning,
      captions: base.imageCaptioning.captions.map((entry) => (blank ? { ...entry, caption: "", decorative: false } : { ...entry, decorative: true })),
    },
  }
}

interface StatusLike {
  stages: Record<string, string>
  steps: Record<string, string>
  [key: string]: unknown
}

export function withCaptionsDone<T extends StatusLike>(status: T): T {
  const stage = status.stages.captions
  const step = status.steps["image-captioning"]
  return {
    ...status,
    stages: { ...status.stages, captions: !stage || stage === "idle" ? "done" : stage },
    steps: { ...status.steps, "image-captioning": !step || step === "idle" ? "done" : step },
  }
}
