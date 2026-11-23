/**
 * Runs the in-app engine E3 several times on every PDF in a folder (books without an answer key) and saves
 * each recommendation, so the report can show what was picked for each book and whether runs agree.
 * Writes a cover thumbnail per book next to the results (keep both out of git when the books are not ours).
 *   OPENAI_API_KEY=... tsx app-e3-books.ts <pdf-dir> <out-dir> [--runs 3] [--models openai:gpt-5.4-mini,openai:gpt-5.4]
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { createLLMModel } from "../../packages/llm/dist/index.js"
import { profileBook, renderBookPages } from "../../packages/pdf/dist/index.js"
import { recommendSetup } from "../../packages/pipeline/dist/index.js"

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { runs: { type: "string", default: "3" }, models: { type: "string", default: "openai:gpt-5.4-mini,openai:gpt-5.4" } },
})
const [pdfDir, outDir] = positionals
mkdirSync(path.join(outDir, "covers"), { recursive: true })
const pdfs = readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()
const slug = (f: string) => f.replace(/\.pdf$/i, "").normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60)

const index: unknown[] = []
for (const file of pdfs) {
  const id = slug(file)
  const buffer = new Uint8Array(readFileSync(path.join(pdfDir, file)))
  let profile
  try {
    profile = profileBook(buffer)
  } catch (err) {
    console.log(`${file}: could not read (${err instanceof Error ? err.message : err})`)
    index.push({ id, file, error: String(err) })
    continue
  }
  writeFileSync(path.join(outDir, "covers", `${id}.jpg`), renderBookPages(buffer, [1], 360).get(1)!)
  const entry = { id, file, sizeMB: +(statSync(path.join(pdfDir, file)).size / 1e6).toFixed(1), pages: profile.pageCount, scanMs: Math.round(profile.ms), runs: [] as string[] }
  for (const modelId of values.models!.split(",")) {
    // A fresh model without a cache dir: every run is a real AI call.
    const model = createLLMModel({ modelId, credentials: { openaiApiKey: process.env.OPENAI_API_KEY }, logLevel: "silent" })
    for (let run = 1; run <= Number(values.runs); run++) {
      const name = `${id}.${modelId.split(":")[1]}.run${run}.json`
      try {
        const rec = await recommendSetup({ id: `${id}-${run}`, model, modelId, profile, renderPages: (p, s) => renderBookPages(buffer, p, s) })
        writeFileSync(path.join(outDir, name), JSON.stringify(rec, null, 2))
        entry.runs.push(name)
        const s = rec.settings
        console.log(`${id} ${modelId} r${run}: ${s.preset?.value} ${s.renderStrategy?.value} ${s.pageGrouping?.value} figures:${s.figureExtraction?.value} act:${s.activitiesGenerator?.value} | asks ${rec.facts.filter((f) => f.ask).map((f) => f.id).join(",") || "-"} | ${Math.round(rec.timings.totalMs)} ms`)
      } catch (err) {
        console.log(`${id} ${modelId} r${run}: FAILED ${err instanceof Error ? err.message : err}`)
      }
    }
  }
  index.push(entry)
}
writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2))
