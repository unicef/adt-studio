/**
 * Converts adt-poc-llm outputs (<book>.runN.json, see run-e0.sh) into this harness's format as
 * variant "e0-poc", so score.ts treats it like any other variant.
 *   tsx import-e0.ts <poc-results-dir> <out-dir>
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DECISIONS } from "./dataset.ts"

const [src, out] = process.argv.slice(2)
for (const f of readdirSync(src).filter((f) => /\.run\d+\.json$/.test(f))) {
  const [bookId, runPart] = f.replace(/\.json$/, "").split(/\.(?=run\d+$)/)
  const r = JSON.parse(readFileSync(path.join(src, f), "utf8"))
  const settings = Object.fromEntries(DECISIONS.map((d) => [d, { value: r.recommendation[d].choice, rule: r.recommendation[d].reason }]))
  writeFileSync(
    path.join(out, `${bookId}.e0-poc.${runPart}.json`),
    JSON.stringify({
      bookId, variant: "e0-poc", run: Number(runPart.slice(3)), model: r.model, settings,
      trace: { sampledPagePairs: r.sampledPagePairs, recommendation: r.recommendation },
      usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, calls: 1 }, ms: r.timing.totalMs,
    }, null, 2),
  )
}
