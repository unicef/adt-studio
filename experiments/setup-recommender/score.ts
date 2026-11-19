/**
 * Scores every variant found in a results dir against a dataset's known-good settings, and
 * measures run-to-run stability. Prints a table and writes <out-dir>/summary.json for reports.
 *   tsx score.ts <dataset.json> <results-dir>
 * Agreement counts labelled decisions over every run. Stability: share of (book, decision)
 * cells where all runs agree.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DECISIONS, loadDataset } from "./dataset.ts"

const [datasetFile, dir] = process.argv.slice(2)
const dataset = loadDataset(datasetFile)
type RunFile = { bookId: string; variant: string; run: number; settings: Record<string, { value: string }>; usage: { inputTokens: number; outputTokens: number; calls: number }; ms: number; profileMs?: number }
const files: RunFile[] = readdirSync(dir).filter((f) => /\.run\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
const variantIds = [...new Set(files.map((f) => f.variant))].sort()

const summary = variantIds.map((variant) => {
  const mine = files.filter((f) => f.variant === variant)
  let agree = 0, total = 0, stable = 0, cells = 0, diagAgree = 0, diagTotal = 0
  const perDecision = Object.fromEntries(DECISIONS.map((d) => [d, { agree: 0, total: 0 }]))
  const books = dataset.books.map((b) => {
    const runs = mine.filter((f) => f.bookId === b.id).sort((x, y) => x.run - y.run)
    const decisions = Object.fromEntries(DECISIONS.map((d) => {
      const values = runs.map((r) => r.settings[d].value)
      const label = b.labels[d]
      if (runs.length) { cells++; if (new Set(values).size === 1) stable++ }
      if (label && b.diagnostic) for (const v of values) { diagTotal++; if (v === label) diagAgree++ }
      if (label && !b.diagnostic) for (const v of values) { total++; perDecision[d].total++; if (v === label) { agree++; perDecision[d].agree++ } }
      return [d, { values, label: label ?? null }]
    }))
    return { id: b.id, diagnostic: !!b.diagnostic, runs: runs.length, decisions }
  })
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
  return {
    variant, agree, total, stable, cells, perDecision, books,
    /** Agreement on the diagnostic books' labelled decisions, reported apart from the main score. */
    diagnostic: { agree: diagAgree, total: diagTotal },
    runsPerBook: Math.max(0, ...books.map((b) => b.runs)),
    avgInputTokens: Math.round(avg(mine.map((f) => f.usage.inputTokens))),
    avgOutputTokens: Math.round(avg(mine.map((f) => f.usage.outputTokens))),
    avgCalls: avg(mine.map((f) => f.usage.calls)),
    avgMs: Math.round(avg(mine.map((f) => f.ms + (f.profileMs ?? 0)))),
  }
})

writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ dataset: dataset.name, note: dataset.note, generatedAt: new Date().toISOString(), variants: summary }, null, 2))
for (const s of summary) {
  console.log(`${s.variant.padEnd(22)} agree ${s.agree}/${s.total} (${Math.round((100 * s.agree) / Math.max(1, s.total))}%)  stable ${s.stable}/${s.cells}  diag ${s.diagnostic.agree}/${s.diagnostic.total}  runs ${s.runsPerBook}  in ${s.avgInputTokens} out ${s.avgOutputTokens} tok  ${s.avgMs}ms  ` +
    DECISIONS.map((d) => `${d}:${s.perDecision[d].agree}/${s.perDecision[d].total}`).join(" "))
}
