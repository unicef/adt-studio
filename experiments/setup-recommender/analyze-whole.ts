/**
 * Offline (no LLM calls). Whole books: what the loader costs and what the page strip and page picker get.
 *   tsx analyze-whole.ts <pdf-dir> <dataset.json> <results-dir>  -> <results-dir>/whole.json
 * Per book: measuring time, the page sample, upload size (PNG as sent today vs JPEG, the same pages), time to
 * upload on slow links, AI time per reading, and the suggested page range of every E12 run.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import mupdf from "../../packages/pdf/node_modules/mupdf/dist/mupdf.js"
import { loadDataset } from "./dataset.ts"
import { choosePages } from "./questions.ts"
import { samplePlan, suggestRange } from "./variants/e12-whole-book.ts"

const [pdfDir, datasetFile, dir] = process.argv.slice(2)
const dataset = loadDataset(datasetFile)
const runs: any[] = readdirSync(dir).filter((f) => /\.run\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))

/** Bytes of the same pages as PNG and as JPEG (quality 70), at the given longest side. Base64 adds a third. */
function bytes(buffer: Uint8Array, pages: number[], size: number) {
  const doc = mupdf.Document.openDocument(buffer, "application/pdf")
  let png = 0, jpg = 0
  for (const n of pages) {
    const page = doc.loadPage(n - 1)
    const b = page.getBounds()
    const scale = size / Math.max(b[2] - b[0], b[3] - b[1])
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
    png += pix.asPNG().length
    jpg += pix.asJPEG(70).length
    pix.destroy?.()
  }
  return { png: Math.round((png * 4) / 3), jpeg: Math.round((jpg * 4) / 3) }
}
const LINKS = { "1 Mbps": 1e6, "5 Mbps": 5e6, "20 Mbps": 20e6 }
const upload = (b: number) => Object.fromEntries(Object.entries(LINKS).map(([k, bps]) => [k, +((b * 8) / bps).toFixed(1)]))
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.floor(s.length / 2)]) : null }

const out: any = { note: "Upload times are bytes x 8 / link speed, request body only (no latency, no server time). PNG is what the harness sends today.", books: [] }
for (const b of dataset.books) {
  const mine = runs.filter((r) => r.bookId === b.id)
  if (!mine.length) continue
  const buffer = readFileSync(path.join(pdfDir, `${b.id}.pdf`))
  const pageCount = mine.find((r) => r.variant === "e12-sampled")?.trace.plan.all.at(-1) ?? null
  const plan = samplePlan(pageCount)
  const e4pages: number[] = mine.find((r) => r.variant === "e4-one-call")?.trace.pages ?? []
  const e13pages: number[] = mine.find((r) => r.variant === "e13-plain-words-middle")?.trace.pages ?? []
  const e12 = bytes(buffer, plan.all, 512)
  const e4 = bytes(buffer, e4pages, 1000)
  const e4small = bytes(buffer, e4pages, 512)
  const e13 = bytes(buffer, e13pages, 1000)
  const readings = Object.fromEntries(["e12-sampled", "e12t-sampled-text", "e4-one-call", "e10-plain-words", "e13-plain-words-middle"].map((v) => {
    const rs = mine.filter((r) => r.variant === v)
    return [v, { aiMs: med(rs.map((r) => r.ms)), inputTokens: med(rs.map((r) => r.usage.inputTokens)), semantic: rs.map((r) => r.trace.semantic) }]
  }))
  out.books.push({
    id: b.id,
    pageCount,
    measureMs: Math.round(mine[0].profileMs),
    sample: { ...plan, size: plan.all.length },
    e4Pages: e4pages,
    e13Pages: e13pages,
    uploadBytes: {
      "e12 (24-38 pages, 512 px)": { ...e12, seconds: { png: upload(e12.png), jpeg: upload(e12.jpeg) } },
      "e12t (no images)": { text: mine.find((r) => r.variant === "e12t-sampled-text")?.trace.uploadBytes ?? null },
      "e4/e10 (6 pages, 1000 px)": { ...e4, seconds: { png: upload(e4.png), jpeg: upload(e4.jpeg) } },
      "e13 (6 middle pages, 1000 px)": { ...e13, seconds: { png: upload(e13.png), jpeg: upload(e13.jpeg) } },
      "e12 + e13 (engine A)": { png: e12.png + e13.png, jpeg: e12.jpeg + e13.jpeg, seconds: { png: upload(e12.png + e13.png), jpeg: upload(e12.jpeg + e13.jpeg) } },
      "e4/e10 at 512 px": { ...e4small, seconds: { jpeg: upload(e4small.jpeg) } },
    },
    readings,
    ranges: mine.filter((r) => r.variant.startsWith("e12")).map((r) => ({ variant: r.variant, run: r.run, range: suggestRange(r.trace.pageLabels, pageCount) })),
    pagesNote: (b as any).pages,
  })
}
writeFileSync(path.join(dir, "whole.json"), JSON.stringify(out, null, 1))
for (const x of out.books) console.log(JSON.stringify({ id: x.id, pages: x.pageCount, measureMs: x.measureMs, sample: x.sample.size, upload: x.uploadBytes, ai: Object.fromEntries(Object.entries(x.readings).map(([k, v]: any) => [k, v.aiMs])), ranges: x.ranges.map((r: any) => `${r.variant[3]}${r.run}:${r.range?.keepCover ? "c+" : ""}${r.range?.start}-${r.range?.end}`) }, null, 1))
