import { api, type PageDetail } from "@/api/client"

export interface PageMockSpec {
  images: number
  keptRatio: number
  words: number
  fonts: number
  scanned?: boolean
}

export interface PageMock {
  spec: PageMockSpec
}

let autoOpenedFor: number | null = null

export function openPageId(): string | null {
  return new URLSearchParams(window.location.search).get("page")
}

export function openFirstPage(key: number, pages: ReadonlyArray<{ pageId: string }>): void {
  if (autoOpenedFor === key || openPageId() || !/\/extract\/?$/.test(window.location.pathname)) return
  const first = pages[0]?.pageId
  if (!first) return
  autoOpenedFor = key
  const url = new URL(window.location.href)
  url.searchParams.set("page", first)
  window.history.pushState(window.history.state, "", url)
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }))
}

const SCALE = 2
const MARGIN = 0.04
const GAP = 0.018
const FONT_FAMILIES = ["swift", "merriweather", "lato", "roboto", "montserrat", "raleway", "lora", "inter", "garamond"]
const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 22, 28]

type ImageEntry = { imageId: string; isPruned: boolean; reason?: string }
type Bounds = { x: number; y: number; width: number; height: number }

export function keptCount(spec: PageMockSpec): number {
  return Math.round(spec.images * spec.keptRatio)
}

function prose(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter((block) => block.length > 0 && !/^\d+$/.test(block))
    .join(" ")
}

function isFiltered(index: number, total: number, filteredCount: number): boolean {
  return Math.floor(((index + 1) * filteredCount) / total) > Math.floor((index * filteredCount) / total)
}

function gridBounds(count: number, aspect: number): Bounds[] {
  if (count === 0) return []
  const columns = Math.max(1, Math.round(Math.sqrt(count * aspect)))
  const rows = Math.ceil(count / columns)
  const cellW = (1 - MARGIN * 2 - GAP * (columns - 1)) / columns
  const cellH = (1 - MARGIN * 2 - GAP * (rows - 1)) / rows
  return Array.from({ length: count }, (_, index) => {
    const shrink = 0.7 + ((index * 37) % 30) / 100
    const w = cellW * shrink
    const h = cellH * (0.75 + ((index * 53) % 25) / 100)
    const column = index % columns
    const row = Math.floor(index / columns)
    return { x: MARGIN + column * (cellW + GAP) + (cellW - w) / 2, y: MARGIN + row * (cellH + GAP) + (cellH - h) / 2, width: w, height: h }
  })
}

function fullBleedBounds(count: number): Bounds[] {
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? { x: 0, y: 0, width: 1, height: 1 } : { x: 0.06 + (index - 1) * 0.12, y: 0.86, width: 0.08, height: 0.08 },
  )
}

async function gatherSources(book: string, pageId: string) {
  const pages = await api.getPages(book)
  const details = await Promise.all(pages.filter((page) => page.pageId !== pageId).map((page) => api.getPage(book, page.pageId).catch(() => null)))
  const kept: string[] = []
  const filtered: Array<{ imageId: string; reason?: string }> = []
  const paragraphs: string[] = []
  for (const detail of details) {
    if (!detail) continue
    for (const image of detail.imageClassification?.images ?? []) {
      if (image.imageId.endsWith("_page")) continue
      if (image.isPruned) filtered.push({ imageId: image.imageId, reason: image.reason })
      else kept.push(image.imageId)
    }
    const paragraph = prose(detail.text ?? "")
    if (paragraph) paragraphs.push(paragraph)
  }
  return { kept, filtered, paragraphs }
}

function takeWords(paragraphs: string[], words: number): string {
  const out: string[] = []
  let left = words
  for (let index = 0; left > 0 && paragraphs.length > 0; index++) {
    const tokens = paragraphs[index % paragraphs.length].split(/\s+/)
    out.push(tokens.slice(0, left).join(" "))
    left -= Math.min(left, tokens.length)
  }
  return out.join("\n\n")
}

export async function mockPage(book: string, page: PageDetail, spec: PageMockSpec): Promise<PageDetail> {
  const sources = await gatherSources(book, page.pageId)
  const pageMeta = page.imagesMeta.find((meta) => meta.imageId === `${page.pageId}_page`)
  const widthPt = (pageMeta?.width ?? 1190) / SCALE
  const heightPt = (pageMeta?.height ?? 840) / SCALE
  const filteredCount = sources.filtered.length > 0 ? spec.images - keptCount(spec) : 0
  const layout = spec.words === 0 && spec.images > 0 && spec.images <= 4 ? fullBleedBounds(spec.images) : gridBounds(spec.images, widthPt / heightPt)

  const images: ImageEntry[] = []
  const imagesMeta: PageDetail["imagesMeta"] = []
  layout.forEach((bounds, index) => {
    const filteredSource = sources.filtered[(index * 7) % Math.max(1, sources.filtered.length)]
    const pruned = isFiltered(index, spec.images, filteredCount) && filteredSource != null
    const keptSource = sources.kept[index % Math.max(1, sources.kept.length)] ?? `${page.pageId}_im001`
    const imageId = `${pruned ? filteredSource.imageId : keptSource}?lab=${String(index + 1).padStart(2, "0")}`
    images.push(pruned ? { imageId, isPruned: true, reason: filteredSource.reason } : { imageId, isPruned: false })
    imagesMeta.push({
      imageId,
      width: Math.round(bounds.width * widthPt * SCALE),
      height: Math.round(bounds.height * heightPt * SCALE),
      bounds: { x: bounds.x * widthPt, y: bounds.y * heightPt, width: bounds.width * widthPt, height: bounds.height * heightPt },
    })
  })
  if (pageMeta) imagesMeta.push(pageMeta)

  const fonts = FONT_FAMILIES.slice(0, spec.fonts).map((family, index) => ({
    family: family.charAt(0).toUpperCase() + family.slice(1),
    sizes: FONT_SIZES.filter((_, sizeIndex) => (sizeIndex + index) % 3 === 0).slice(0, 2 + (index % 3)),
  }))

  return {
    ...page,
    text: takeWords(sources.paragraphs, spec.words),
    imagesMeta,
    imageClassification: { images },
    fonts,
    fontProfile: spec.fonts > 0 ? (page.fontProfile ?? { category: "serif", serifChars: 1, sansChars: 0 }) : null,
    extractionWarning: spec.scanned ? "text-layer-missing" : null,
  }
}
