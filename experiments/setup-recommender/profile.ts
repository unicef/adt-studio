/**
 * E1 — deterministic PDF profile, no LLM. One pass per page with mupdf (the same WASM build
 * @adt/pdf uses): geometry, visible vs invisible text, image placements, vector paths,
 * a small render for edge samples (spread detection) and ink.
 */
import mupdf from "../../packages/pdf/node_modules/mupdf/dist/mupdf.js"
import { detectSpreads, type SpreadEdgeSample } from "../../packages/pipeline/src/spread-detection.ts"

type Rect = [number, number, number, number]

export interface PageProfile {
  page: number // 1-indexed
  width: number
  height: number
  visibleChars: number
  invisibleChars: number
  textBlocks: Rect[]
  images: { rect: Rect; pxW: number; pxH: number }[]
  imageCoverage: number // union-approx: sum of clipped image areas / page area, capped at 1
  maxImageCoverage: number
  pathCount: number
  textOverImageChars: number // visible chars whose block sits inside an image rect covering >= 30% of page
  ink: number // share of non-white pixels in the small render
  text: string
}

export interface BookProfile {
  file: string
  pageCount: number
  language: string | null
  producer: string
  pages: PageProfile[]
  spreadSuggestions: { lead: number; confidence: number }[]
  ms: number
}

const area = (r: Rect) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1])
const clip = (r: Rect, b: Rect): Rect => [Math.max(r[0], b[0]), Math.max(r[1], b[1]), Math.min(r[2], b[2]), Math.min(r[3], b[3])]
const inside = (inner: Rect, outer: Rect, slack = 0.5) => area(clip(inner, outer)) >= slack * area(inner)

function countGlyphs(text: mupdf.Text): number {
  let n = 0
  text.walk({ showGlyph: (_f, _t, _g, uni) => { if (uni > 32) n++ } })
  return n
}

function profilePage(doc: mupdf.Document, index: number): { profile: PageProfile; edges: SpreadEdgeSample } {
  const page = doc.loadPage(index)
  const b = page.getBounds() as Rect
  const pageRect: Rect = [b[0], b[1], b[2], b[3]]
  const pageArea = area(pageRect)

  let invisibleChars = 0
  let pathCount = 0
  const images: PageProfile["images"] = []
  const dev = new mupdf.Device({
    ignoreText: (text) => { invisibleChars += countGlyphs(text) },
    fillPath: () => { pathCount++ },
    strokePath: () => { pathCount++ },
    fillImage: (image, ctm) => {
      const m = ctm as unknown as number[]
      const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]]
      const ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]]
      images.push({ rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], pxW: image.getWidth(), pxH: image.getHeight() })
    },
  })
  page.run(dev, mupdf.Matrix.identity)
  dev.close()

  const st = page.toStructuredText("preserve-whitespace")
  const json = JSON.parse(st.asJSON()) as { blocks: { type: string; bbox: { x: number; y: number; w: number; h: number }; lines?: { text: string }[] }[] }
  const textBlocks: Rect[] = []
  let text = ""
  let textOverImageChars = 0
  const bigImages = images.filter((i) => area(clip(i.rect, pageRect)) >= 0.3 * pageArea)
  for (const block of json.blocks) {
    if (block.type !== "text" || !block.lines) continue
    const r: Rect = [block.bbox.x, block.bbox.y, block.bbox.x + block.bbox.w, block.bbox.y + block.bbox.h]
    const t = block.lines.map((l) => l.text).join(" ")
    textBlocks.push(r)
    text += t + "\n"
    if (bigImages.some((i) => inside(r, i.rect))) textOverImageChars += t.replace(/\s/g, "").length
  }
  const totalChars = text.replace(/\s/g, "").length
  const visibleChars = Math.max(0, totalChars - invisibleChars)

  const coverages = images.map((i) => area(clip(i.rect, pageRect)) / pageArea)
  const imageCoverage = Math.min(1, coverages.reduce((s, c) => s + c, 0))
  const maxImageCoverage = Math.max(0, ...coverages)

  // Small render: edges for spread detection + ink share.
  const scale = 300 / Math.max(b[2] - b[0], 1)
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceGray, false)
  const w = pix.getWidth()
  const h = pix.getHeight()
  const stride = pix.getStride()
  const px = pix.getPixels()
  let inked = 0
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (px[y * stride + x] < 240) inked++
  const ink = inked / (Math.ceil(h / 2) * Math.ceil(w / 2))
  const leftEdge: number[] = []
  const rightEdge: number[] = []
  for (let i = 0; i < 48; i++) {
    const y = Math.min(h - 1, Math.floor(((i + 0.5) * h) / 48))
    leftEdge.push(px[y * stride + Math.min(2, w - 1)])
    rightEdge.push(px[y * stride + Math.max(0, w - 3)])
  }
  pix.destroy?.()

  return {
    profile: {
      page: index + 1,
      width: b[2] - b[0],
      height: b[3] - b[1],
      visibleChars,
      invisibleChars,
      textBlocks,
      images,
      imageCoverage,
      maxImageCoverage,
      pathCount,
      textOverImageChars,
      ink,
      text: text.replace(/[ \t]+/g, " ").trim(),
    },
    edges: { pageNumber: index + 1, leftEdge, rightEdge, textLength: totalChars },
  }
}

/** Renders 1-indexed pages as PNGs (or JPEG, quality 70, round 3), longest side about `size` px. */
export function renderPages(buffer: Uint8Array, pages: number[], size = 1000, format: "png" | "jpeg" = "png"): Map<number, Uint8Array> {
  const doc = mupdf.Document.openDocument(buffer, "application/pdf")
  const out = new Map<number, Uint8Array>()
  for (const n of pages) {
    const page = doc.loadPage(n - 1)
    const b = page.getBounds()
    const scale = size / Math.max(b[2] - b[0], b[3] - b[1])
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
    out.set(n, format === "jpeg" ? pix.asJPEG(70) : pix.asPNG())
    pix.destroy?.()
  }
  return out
}

export function profilePdf(file: string, buffer: Uint8Array, range?: { start: number; end: number }): BookProfile {
  const started = performance.now()
  const doc = mupdf.Document.openDocument(buffer, "application/pdf")
  const pageCount = doc.countPages()
  const start = range ? range.start - 1 : 0
  const end = range ? range.end : pageCount
  const pages: PageProfile[] = []
  const edges: SpreadEdgeSample[] = []
  for (let i = start; i < end; i++) {
    const { profile, edges: e } = profilePage(doc, i)
    pages.push(profile)
    edges.push(e)
  }
  const pdf = doc.asPDF?.()
  const language = pdf ? pdf.getLanguage() : null
  const producer = doc.getMetaData("info:Producer") ?? ""
  return { file, pageCount, language, producer, pages, spreadSuggestions: detectSpreads(edges), ms: performance.now() - started }
}
