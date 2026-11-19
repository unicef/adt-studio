/**
 * Runs variants on every PDF of a dataset and writes one JSON per (book, variant, run).
 *   tsx run.ts <pdf-dir> <dataset.json> <out-dir> [--variants a,b] [--runs 3] [--model gpt-5.4-mini]
 * [--tag t] Deterministic variants run once.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { loadDataset } from "./dataset.ts"
import { deriveFacts } from "./facts.ts"
import { profilePdf } from "./profile.ts"
import { VARIANTS } from "./variants/index.ts"

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { variants: { type: "string" }, runs: { type: "string", default: "3" }, model: { type: "string", default: "gpt-5.4-mini" }, tag: { type: "string" } },
})
const [pdfDir, datasetFile, out] = positionals
const wanted = values.variants ? values.variants.split(",") : VARIANTS.map((v) => v.id)
const variants = VARIANTS.filter((v) => wanted.includes(v.id))
if (variants.length !== wanted.length) throw new Error(`Unknown variant in ${wanted.join(",")}; known: ${VARIANTS.map((v) => v.id).join(",")}`)
const runs = Number(values.runs)
const dataset = loadDataset(datasetFile)

mkdirSync(out, { recursive: true })
for (const entry of dataset.books) {
  const pdf = path.join(pdfDir, `${entry.id}.pdf`)
  if (!existsSync(pdf)) { console.log(`skip ${entry.id}: no PDF`); continue }
  const buffer = readFileSync(pdf)
  const book = profilePdf(entry.id, buffer)
  const facts = deriveFacts(book)
  const ctx = { bookId: entry.id, buffer, book, facts, model: values.model!, description: entry.description, userFacts: entry.facts }
  for (const variant of variants) {
    for (let run = 1; run <= (variant.deterministic ? 1 : runs); run++) {
      try {
        const res = await variant.run(ctx)
        // --tag keeps runs of the same variant with another model apart: <id>@<tag>
        const id = values.tag ? `${variant.id}@${values.tag}` : variant.id
        writeFileSync(
          path.join(out, `${entry.id}.${id}.run${run}.json`),
          JSON.stringify({ bookId: entry.id, variant: id, run, model: variant.deterministic ? null : values.model, profileMs: book.ms, facts, ...res }, null, 2),
        )
        console.log(`ok ${entry.id} ${variant.id} run${run} ${Math.round(res.ms)}ms`)
      } catch (e) {
        console.log(`FAIL ${entry.id} ${variant.id} run${run}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }
}
