/**
 * Runs the in-app engine E3 (packages/pipeline/src/setup-recommender, built to dist) through @adt/llm on a
 * folder of PDFs and compares its settings with a dataset's labels. Proves the port matches the experiments.
 *   OPENAI_API_KEY=... tsx app-e3-check.ts <pdf-dir> <dataset.json> <out-dir> [--model openai:gpt-5.4-mini] [--runs 1]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { createLLMModel } from "../../packages/llm/dist/index.js"
import { profileBook, renderBookPages } from "../../packages/pdf/dist/index.js"
import { recommendSetup } from "../../packages/pipeline/dist/index.js"
import { DECISIONS, loadDataset } from "./dataset.ts"

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { model: { type: "string", default: "openai:gpt-5.4-mini" }, runs: { type: "string", default: "1" } },
})
const [pdfDir, datasetFile, outDir] = positionals
const dataset = loadDataset(datasetFile)
mkdirSync(outDir, { recursive: true })
const model = createLLMModel({
  modelId: values.model!,
  credentials: { openaiApiKey: process.env.OPENAI_API_KEY },
  logLevel: "silent",
})

let right = 0
let total = 0
let asked = 0
let silentWrong = 0
for (const entry of dataset.books) {
  const buffer = new Uint8Array(readFileSync(path.join(pdfDir, `${entry.id}.pdf`)))
  for (let run = 1; run <= Number(values.runs); run++) {
    const profile = profileBook(buffer)
    const rec = await recommendSetup({
      id: `${entry.id}-${run}`,
      model,
      modelId: values.model!,
      profile,
      renderPages: (pages, size) => renderBookPages(buffer, pages, size),
    })
    writeFileSync(path.join(outDir, `${entry.id}.run${run}.json`), JSON.stringify(rec, null, 2))
    const askedFacts = rec.facts.filter((f) => f.ask)
    asked += askedFacts.length
    const row: string[] = []
    for (const d of DECISIONS) {
      const label = entry.labels?.[d]
      if (label === undefined) continue
      const got = rec.settings[d as keyof typeof rec.settings]?.value
      const norm = typeof got === "boolean" ? (got ? "enabled" : "disabled") : got
      const ok = norm === label
      total++
      if (ok) right++
      else row.push(`${d}: got ${norm}, want ${label}`)
    }
    // A wrong setting is silent when no asked fact could change it.
    const askedIds = new Set(askedFacts.map((f) => f.id))
    const DEPENDS: Record<string, string[]> = {
      preset: ["genre"], renderStrategy: ["genre", "composition"], sectioningMode: ["genre", "exercises", "composition"],
      activitiesGenerator: ["genre", "exercises"], figureExtraction: ["diagrams"], pageGrouping: [],
    }
    for (const r of row) {
      const d = r.split(":")[0]
      if (!DEPENDS[d].some((f) => askedIds.has(f))) silentWrong++
    }
    const t = rec.timings
    console.log(
      `${entry.id} r${run}: ${row.length === 0 ? "all right" : row.join("; ")} | asks ${askedFacts.map((f) => `${f.id}(${f.askReason})`).join(",") || "nothing"} | scan ${Math.round(t.profileMs)} ms, labels ${Math.round(t.labelsMs ?? 0)} ms, questions ${Math.round(t.questionsMs ?? 0)} ms, total ${Math.round(t.totalMs)} ms, upload ${Math.round(t.uploadBytes / 1024)} KB`,
    )
  }
}
console.log(`\n${right}/${total} settings match the labels; ${asked} questions asked; ${silentWrong} wrong settings not covered by a question`)
