/**
 * Offline: gathers every saved E3 run (in-app engine) and the E0 baseline into one JSON for the cost and
 * time report (reports/e3-costs.html).
 *   tsx report-e3-costs.ts <out.json>
 * Prices are USD per 1M tokens, OpenAI standard tier, looked up 2026-11-23 (openai.com/api/pricing).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs"
import path from "node:path"

const PRICES: Record<string, { in: number; out: number }> = {
  "gpt-5.4": { in: 2.5, out: 15 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
}
const cost = (model: string, i: number, o: number) => (i * PRICES[model].in + o * PRICES[model].out) / 1e6

type Rec = {
  id: string
  pageCount: number
  facts: { ask: boolean }[]
  timings: { profileMs: number; factsMs: number; questionsMs: number | null; labelsMs: number | null; totalMs: number; uploadBytes: number }
  usage: { inputTokens: number; outputTokens: number; calls: number }
}

function runs(dir: string, model: string) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.run\d+\.json$/.test(f))
    .map((f) => {
      const r = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Rec
      const [book, runPart] = f.replace(".json", "").split(".run")
      return {
        book,
        run: Number(runPart),
        model,
        pages: r.pageCount,
        asked: r.facts.filter((x) => x.ask).length,
        scanMs: Math.round(r.timings.profileMs),
        labelsMs: Math.round(r.timings.labelsMs ?? 0),
        questionsMs: Math.round(r.timings.questionsMs ?? 0),
        totalMs: Math.round(r.timings.totalMs),
        uploadKB: Math.round(r.timings.uploadBytes / 1024),
        tokensIn: r.usage.inputTokens,
        tokensOut: r.usage.outputTokens,
        usd: cost(model, r.usage.inputTokens, r.usage.outputTokens),
      }
    })
}

// The split runs are one extra run per book that also record tokens per reading.
const e3 = [
  ...runs("results/app-e3", "gpt-5.4-mini"),
  ...runs("results/app-e3-gpt54", "gpt-5.4"),
  ...runs("results/app-e3-split-gpt-5.4-mini", "gpt-5.4-mini").map((r) => ({ ...r, run: 4 })),
  ...runs("results/app-e3-split-gpt-5.4", "gpt-5.4").map((r) => ({ ...r, run: 4 })),
]
const split = ["gpt-5.4-mini", "gpt-5.4"].flatMap((model) => {
  const dir = `results/app-e3-split-${model}`
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    const u = JSON.parse(readFileSync(path.join(dir, f), "utf8")).usage
    return { book: f.split(".run")[0], model, labels: u.labels, questions: u.questions }
  })
})

// E0 (Victor's PoC one call) from the experiment harness, same books, gpt-5.4-mini.
const e0 = readdirSync("results/poc")
  .filter((f) => f.includes(".e0-poc.run"))
  .map((f) => {
    const r = JSON.parse(readFileSync(path.join("results/poc", f), "utf8"))
    return { book: r.bookId, model: r.model, ms: Math.round(r.ms), tokensIn: r.usage.inputTokens, tokensOut: r.usage.outputTokens, usd: cost(r.model, r.usage.inputTokens, r.usage.outputTokens) }
  })

const timing = (file: string) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null)
const scaling = [
  ["storybook-hyena-and-raven", "gpt-5.4"],
  ["textbook-egito-antigo", "gpt-5.4"],
  ["storybook-hyena-and-raven", "gpt-5.4-mini"],
  ["textbook-egito-antigo", "gpt-5.4-mini"],
]
  .map(([book, model]) => {
    const t = timing(`results/app-e3/timing-${model === "gpt-5.4" ? "" : "mini-"}${book}.json`)
    return t && { book, model, rows: t.rows.map((r: { tokensIn: number }) => ({ ...r, usd: cost(model, r.tokensIn, 430) })) }
  })
  .filter(Boolean)

writeFileSync(process.argv[2], JSON.stringify({ prices: PRICES, e3, e0, scaling, split }, null, 2))
const by = (m: string) => e3.filter((r) => r.model === m)
for (const m of Object.keys(PRICES)) {
  const rs = by(m)
  if (!rs.length) continue
  const avg = (k: keyof (typeof rs)[number]) => rs.reduce((s, r) => s + (r[k] as number), 0) / rs.length
  console.log(m, rs.length, "runs: avg", Math.round(avg("totalMs")), "ms,", Math.round(avg("tokensIn")), "in,", Math.round(avg("tokensOut")), "out, $", avg("usd").toFixed(4))
}
console.log("e0", e0.length, "runs: avg $", (e0.reduce((s, r) => s + r.usd, 0) / e0.length).toFixed(4), Math.round(e0.reduce((s, r) => s + r.ms, 0) / e0.length), "ms")
