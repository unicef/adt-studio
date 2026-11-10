/* eslint-disable lingui/no-unlocalized-strings -- lab-only fake pipeline reasons, never shown untranslated in the product */
import type { PageDetail, PageSummaryItem } from "@/api/client"

export interface PruneMock {
  mode: "varied" | "none"
  htmlPages?: string[]
}

type Entry = { imageId: string; isPruned: boolean; reason?: string }
type Classification = { images: Entry[] }

const PAGE_ELEMENT_REASONS = [
  "auto figure filter: A simple two-column table of words and their meanings. The text is selectable, so it can be rebuilt as an HTML table.",
  "auto figure filter: A coloured callout box with a short tip. It is mostly selectable text on a flat background.",
  "auto figure filter: A chapter heading drawn as artwork; the same words are on the page as text.",
  "auto figure filter: A text card with a definition inside a rounded frame.",
]

function variedReason(pageNumber: number, index: number, keptId: string | undefined, original: string | undefined): string | undefined {
  const cycle = [
    "not meaningful: A thin decorative border along the page edge; it carries no information.",
    keptId ? `duplicate artwork: kept composite ${keptId}` : "manual",
    original,
    "longest side 5200px > max_side 4000px",
    "segmented",
    "cropped",
    "manual",
    original,
  ]
  return cycle[(pageNumber * 3 + index) % cycle.length]
}

const overrides = new Map<string, Classification>()
const rawPages = new Map<string, PageDetail>()

function overrideKey(book: string, startedAt: number, pageId: string) {
  return `${book}/${startedAt}/${pageId}`
}

const puts: Array<{ pageId: string; body: unknown }> = []

export function rememberPrunePut(book: string, startedAt: number, pageId: string, body: unknown) {
  puts.push({ pageId, body })
  if (body && typeof body === "object" && Array.isArray((body as Classification).images)) overrides.set(overrideKey(book, startedAt, pageId), body as Classification)
}

export function simulatedPrunePuts(): ReadonlyArray<{ pageId: string; body: unknown }> {
  return puts
}

function rewrite(page: PageDetail, mock: PruneMock): Classification | null {
  const base = page.imageClassification
  if (!base) return null
  const pageImageId = `${page.pageId}_page`
  if (mock.mode === "none") {
    return { images: base.images.map((image) => (image.imageId === pageImageId ? image : { imageId: image.imageId, isPruned: false })) }
  }
  const kept = base.images.filter((image) => !image.isPruned && image.imageId !== pageImageId)
  const flip = mock.htmlPages?.includes(page.pageId) ? kept[0]?.imageId : undefined
  const keptId = kept.find((image) => image.imageId !== flip)?.imageId
  let prunedIndex = 0
  let guardDone = false
  return {
    images: base.images.map((image) => {
      if (image.imageId === pageImageId) return image
      if (image.imageId === flip) return { imageId: image.imageId, isPruned: true, reason: PAGE_ELEMENT_REASONS[page.pageNumber % PAGE_ELEMENT_REASONS.length] }
      if (!image.isPruned) {
        if (!guardDone && page.pageNumber % 4 === 0) {
          guardDone = true
          return { ...image, reason: "auto guard kept: raster artwork with no selectable-text copy and no surviving standalone duplicate (LLM: Looks like a small ornament next to the title.)" }
        }
        return image
      }
      const reason = variedReason(page.pageNumber, prunedIndex++, keptId, image.reason)
      return { imageId: image.imageId, isPruned: true, ...(reason ? { reason } : {}) }
    }),
  }
}

export function mockPrunePage(book: string, startedAt: number, page: PageDetail, mock: PruneMock): PageDetail {
  rawPages.set(`${book}/${page.pageId}`, page)
  const stored = overrides.get(overrideKey(book, startedAt, page.pageId))
  const imageClassification = stored ?? rewrite(page, mock)
  return imageClassification ? { ...page, imageClassification } : page
}

function counts(pageId: string, classification: Classification) {
  let kept = 0
  let filtered = 0
  let html = 0
  for (const image of classification.images) {
    if (image.imageId === `${pageId}_page`) continue
    if (!image.isPruned) kept++
    else {
      filtered++
      if (/^auto figure filter\b/i.test(image.reason ?? "")) html++
    }
  }
  return { keptImageCount: kept, filteredImageCount: filtered, htmlImageCount: html }
}

export async function mockPruneSummary<T extends PageSummaryItem>(
  book: string,
  startedAt: number,
  pages: T[],
  mock: PruneMock,
  load: (pageId: string) => Promise<unknown>,
): Promise<T[]> {
  await Promise.all(pages.filter((page) => page.imageCount > 0 && !rawPages.has(`${book}/${page.pageId}`)).map((page) => load(page.pageId).catch(() => null)))
  return pages.map((page) => {
    const raw = rawPages.get(`${book}/${page.pageId}`)
    if (!raw) return page
    const classification = mockPrunePage(book, startedAt, raw, mock).imageClassification
    return classification ? { ...page, ...counts(page.pageId, classification) } : page
  })
}
