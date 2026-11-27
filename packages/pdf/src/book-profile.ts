/**
 * Book profile for auto mode (issue #333): one fast pass over every page with
 * mupdf, no AI. Measures what the setup recommender needs to know before a
 * book exists: page geometry, visible vs invisible (OCR) text, image
 * placements, vector paths, ink, and the edge samples spread detection reads.
 *
 * Ported from experiments/setup-recommender/profile.ts. Spread detection
 * itself lives in @adt/pipeline (which depends on this package), so the
 * profile returns the raw edge samples and the caller runs `detectSpreads`.
 */
import mupdf, { type Document as MupdfDocument, type Text as MupdfText } from "mupdf"

type Rect = [number, number, number, number]

export interface BookPageProfile {
  /** 1-indexed page number. */
  page: number
  width: number
  height: number
  visibleChars: number
  /** Glyphs drawn invisibly (an OCR layer over a scan). */
  invisibleChars: number
  images: { rect: Rect; pxW: number; pxH: number }[]
  /** Sum of image areas clipped to the page, as a share of the page, capped at 1. */
  imageCoverage: number
  maxImageCoverage: number
  pathCount: number
  /** Visible characters whose block sits on an image covering at least 30% of the page. */
  textOverImageChars: number
  /** Share of non-white pixels in a small render. */
  ink: number
  text: string
}

export interface BookPageEdges {
  pageNumber: number
  leftEdge: number[]
  rightEdge: number[]
  textLength: number
  /** Characters in text blocks that reach into the outer 4% of the page on each side: text that can
   *  sit under the edge sample, unlike captions and body text kept inside the margins. */
  textNearLeftEdge: number
  textNearRightEdge: number
}

export interface BookProfile {
  pageCount: number
  /** Language tag from the PDF catalog, when set. */
  language: string | null
  producer: string
  pages: BookPageProfile[]
  edges: BookPageEdges[]
  ms: number
}

const area = (r: Rect) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1])
const clip = (r: Rect, b: Rect): Rect => [
  Math.max(r[0], b[0]),
  Math.max(r[1], b[1]),
  Math.min(r[2], b[2]),
  Math.min(r[3], b[3]),
]
const inside = (inner: Rect, outer: Rect, slack = 0.5) => area(clip(inner, outer)) >= slack * area(inner)

function countGlyphs(text: MupdfText): number {
  let n = 0
  text.walk({
    showGlyph: (_f, _t, _g, uni) => {
      if (uni > 32) n++
    },
  })
  return n
}

function profilePage(doc: MupdfDocument, index: number): { profile: BookPageProfile; edges: BookPageEdges } {
  const page = doc.loadPage(index)
  try {
    const b = page.getBounds() as Rect
    const pageRect: Rect = [b[0], b[1], b[2], b[3]]
    const pageArea = Math.max(1, area(pageRect))

    let invisibleChars = 0
    let pathCount = 0
    const images: BookPageProfile["images"] = []
    const dev = new mupdf.Device({
      // Release every wrapper the device hands us right away. Left to the GC,
      // they pin images in mupdf's store and a long picture book crawls, then
      // runs out of memory (see mupdf-image-refs.ts).
      ignoreText: (text) => {
        invisibleChars += countGlyphs(text)
        text.destroy()
      },
      fillPath: (path) => {
        pathCount++
        path.destroy()
      },
      strokePath: (path) => {
        pathCount++
        path.destroy()
      },
      fillImage: (image, ctm) => {
        const m = ctm as unknown as number[]
        const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]]
        const ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]]
        images.push({
          rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
          pxW: image.getWidth(),
          pxH: image.getHeight(),
        })
        image.destroy()
      },
    })
    page.run(dev, mupdf.Matrix.identity)
    dev.close()
    dev.destroy()

    // Free WASM memory per page: without this a long picture book runs out of memory.
    const st = page.toStructuredText("preserve-whitespace")
    const stJson = st.asJSON()
    st.destroy()
    const json = JSON.parse(stJson) as {
      blocks: { type: string; bbox: { x: number; y: number; w: number; h: number }; lines?: { text: string }[] }[]
    }
    let text = ""
    let textOverImageChars = 0
    let textNearLeftEdge = 0
    let textNearRightEdge = 0
    const band = 0.04 * (b[2] - b[0])
    const bigImages = images.filter((i) => area(clip(i.rect, pageRect)) >= 0.3 * pageArea)
    for (const block of json.blocks) {
      if (block.type !== "text" || !block.lines) continue
      const r: Rect = [block.bbox.x, block.bbox.y, block.bbox.x + block.bbox.w, block.bbox.y + block.bbox.h]
      const t = block.lines.map((l) => l.text).join(" ")
      text += t + "\n"
      const chars = t.replace(/\s/g, "").length
      if (r[0] <= b[0] + band) textNearLeftEdge += chars
      if (r[2] >= b[2] - band) textNearRightEdge += chars
      if (bigImages.some((i) => inside(r, i.rect))) textOverImageChars += t.replace(/\s/g, "").length
    }
    const totalChars = text.replace(/\s/g, "").length
    const visibleChars = Math.max(0, totalChars - invisibleChars)

    const coverages = images.map((i) => area(clip(i.rect, pageRect)) / pageArea)
    const imageCoverage = Math.min(1, coverages.reduce((s, c) => s + c, 0))
    const maxImageCoverage = Math.max(0, ...coverages)

    // Small grey render: page edges for spread detection, and ink share.
    const scale = 300 / Math.max(b[2] - b[0], 1)
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceGray, false)
    const w = pix.getWidth()
    const h = pix.getHeight()
    const stride = pix.getStride()
    const px = pix.getPixels()
    let inked = 0
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (px[y * stride + x] < 240) inked++
    const ink = inked / Math.max(1, Math.ceil(h / 2) * Math.ceil(w / 2))
    const leftEdge: number[] = []
    const rightEdge: number[] = []
    for (let i = 0; i < 48; i++) {
      const y = Math.min(h - 1, Math.floor(((i + 0.5) * h) / 48))
      leftEdge.push(px[y * stride + Math.min(2, w - 1)])
      rightEdge.push(px[y * stride + Math.max(0, w - 3)])
    }
    pix.destroy()

    return {
      profile: {
        page: index + 1,
        width: b[2] - b[0],
        height: b[3] - b[1],
        visibleChars,
        invisibleChars,
        images,
        imageCoverage,
        maxImageCoverage,
        pathCount,
        textOverImageChars,
        ink,
        text: text.replace(/[ \t]+/g, " ").trim(),
      },
      edges: { pageNumber: index + 1, leftEdge, rightEdge, textLength: totalChars, textNearLeftEdge, textNearRightEdge },
    }
  } finally {
    page.destroy()
  }
}

/** The profiling, one page per step, so the async version can hand the event loop back between pages. */
function* profileSteps(buffer: Uint8Array, range?: { start: number; end: number }): Generator<void, BookProfile, void> {
  const started = performance.now()
  const doc = mupdf.Document.openDocument(buffer, "application/pdf")
  try {
    const pageCount = doc.countPages()
    const start = range ? Math.max(0, range.start - 1) : 0
    const end = range ? Math.min(pageCount, range.end) : pageCount
    const pages: BookPageProfile[] = []
    const edges: BookPageEdges[] = []
    for (let i = start; i < end; i++) {
      const r = profilePage(doc, i)
      pages.push(r.profile)
      edges.push(r.edges)
      yield
    }
    const pdf = doc.asPDF()
    const language = pdf ? pdf.getLanguage() || null : null
    const producer = doc.getMetaData("info:Producer") ?? ""
    return { pageCount, language, producer, pages, edges, ms: performance.now() - started }
  } finally {
    doc.destroy()
  }
}

/** Profiles every page (or a 1-indexed inclusive range). */
export function profileBook(buffer: Uint8Array, range?: { start: number; end: number }): BookProfile {
  const steps = profileSteps(buffer, range)
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
  }
}

/**
 * profileBook for a server: it hands the event loop back every few pages (so one long book doesn't
 * freeze every other request, or the desktop app's main process) and stops when `signal` aborts.
 */
export async function profileBookAsync(
  buffer: Uint8Array,
  opts: { range?: { start: number; end: number }; signal?: AbortSignal; pagesPerTurn?: number } = {},
): Promise<BookProfile> {
  return runAsync(profileSteps(buffer, opts.range), opts.pagesPerTurn ?? 2, opts.signal)
}

/** The rendering, one page per step (see profileSteps). */
function* renderSteps(
  buffer: Uint8Array,
  pages: number[],
  size: number,
  format: "png" | "jpeg",
): Generator<void, Map<number, Uint8Array>, void> {
  const doc = mupdf.Document.openDocument(buffer, "application/pdf")
  const out = new Map<number, Uint8Array>()
  try {
    for (const n of pages) {
      const page = doc.loadPage(n - 1)
      try {
        const b = page.getBounds()
        const scale = size / Math.max(b[2] - b[0], b[3] - b[1], 1)
        const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
        out.set(n, format === "jpeg" ? pix.asJPEG(70) : pix.asPNG())
        pix.destroy()
      } finally {
        page.destroy()
      }
      yield
    }
  } finally {
    doc.destroy()
  }
  return out
}

/** Renders 1-indexed pages with the longest side about `size` px. JPEG at quality 70 by default (5x smaller than PNG on picture books). */
export function renderBookPages(
  buffer: Uint8Array,
  pages: number[],
  size = 512,
  format: "png" | "jpeg" = "jpeg",
): Map<number, Uint8Array> {
  const steps = renderSteps(buffer, pages, size, format)
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
  }
}

/** renderBookPages for a server: one page per turn of the event loop, and it stops when `signal` aborts. */
export async function renderBookPagesAsync(
  buffer: Uint8Array,
  pages: number[],
  opts: { size?: number; format?: "png" | "jpeg"; signal?: AbortSignal } = {},
): Promise<Map<number, Uint8Array>> {
  return runAsync(renderSteps(buffer, pages, opts.size ?? 512, opts.format ?? "jpeg"), 1, opts.signal)
}

/** Runs a step generator, handing the event loop back every `every` steps and stopping on abort. */
async function runAsync<T>(steps: Generator<void, T, void>, every: number, signal?: AbortSignal): Promise<T> {
  try {
    signal?.throwIfAborted()
    for (let n = 1; ; n++) {
      const r = steps.next()
      if (r.done) return r.value
      if (n % every === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
        signal?.throwIfAborted()
      }
    }
  } finally {
    // Closes the document when it stopped early (a no-op once it finished).
    steps.return(undefined as never)
  }
}
