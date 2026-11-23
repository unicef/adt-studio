/**
 * T3 (time cost): how long the in-app E3 scan and AI reading take as books get longer. Builds test PDFs of
 * 12, 50, 150 and 400 pages by repeating the pages of one source PDF (mupdf graft), then times the scan alone
 * and the full recommendation. AI calls use a fresh model with no cache.
 *   OPENAI_API_KEY=... tsx app-e3-timing.ts <source.pdf> <out.json> [--model openai:gpt-5.4] [--sizes 12,50,150,400]
 */
import { readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import mupdf from "../../packages/pdf/node_modules/mupdf/dist/mupdf.js"
import { createLLMModel } from "../../packages/llm/dist/index.js"
import { profileBook, renderBookPages } from "../../packages/pdf/dist/index.js"
import { recommendSetup } from "../../packages/pipeline/dist/index.js"

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { model: { type: "string", default: "openai:gpt-5.4" }, sizes: { type: "string", default: "12,50,150,400" } },
})
const [source, outFile] = positionals
const src = mupdf.Document.openDocument(new Uint8Array(readFileSync(source)), "application/pdf").asPDF()!
const srcPages = src.countPages()

function build(n: number): Uint8Array {
  const out = new mupdf.PDFDocument()
  // One graft map: repeated pages share their images, like a real book of that length would.
  const map = out.newGraftMap()
  for (let i = 0; i < n; i++) map.graftPage(-1, src, i % srcPages)
  return out.saveToBuffer("compress").asUint8Array().slice()
}

const rows = []
for (const size of values.sizes!.split(",").map(Number)) {
  const buffer = build(size)
  const scanStart = performance.now()
  const profile = profileBook(buffer)
  const scanMs = performance.now() - scanStart
  const model = createLLMModel({ modelId: values.model!, credentials: { openaiApiKey: process.env.OPENAI_API_KEY }, logLevel: "silent" })
  const started = performance.now()
  const rec = await recommendSetup({ id: `t3-${size}`, model, modelId: values.model!, profile, renderPages: (p, s) => renderBookPages(buffer, p, s) })
  const afterScanMs = performance.now() - started
  const row = {
    pages: size,
    scanMs: Math.round(scanMs),
    scanMsPerPage: +(scanMs / size).toFixed(1),
    readingMs: Math.round(afterScanMs),
    labelsMs: Math.round(rec.timings.labelsMs ?? 0),
    questionsMs: Math.round(rec.timings.questionsMs ?? 0),
    totalMs: Math.round(scanMs + afterScanMs),
    uploadKB: Math.round(rec.timings.uploadBytes / 1024),
    // Seconds to send the pages on a 1 Mbit/s upload, on top of the measured time.
    extraAt1MbpsS: +((rec.timings.uploadBytes * 8) / 1e6).toFixed(1),
    tokensIn: rec.usage.inputTokens,
  }
  rows.push(row)
  console.log(JSON.stringify(row))
}
writeFileSync(outFile, JSON.stringify({ source: source.split("/").pop(), model: values.model, rows }, null, 2))
