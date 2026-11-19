/**
 * Offline user-in-the-loop simulation. No LLM calls: replays the saved runs with the dataset's
 * hand-labelled true facts standing in for an honest user.
 *   tsx simulate.ts <dataset.json> <results-dir>    -> <results-dir>/simulation.json
 *
 * Flows:
 *  - review-all:     the user sees every fact card and corrects the wrong ones.
 *  - review-flagged: the user only sees the cards the variant flagged (low confidence, slices disagree,
 *                    too few pages...). Wrong unflagged facts stay wrong: "silent errors".
 *  - teach-settings: a chat walks through the 6 settings and the user confirms or changes each one.
 *                    Corrections are counted against the labelled settings.
 * Calibration: of the wrong facts, how many did the variant flag? Of the flags, how many were wrong?
 * Settings after correction are scored with rules.ts, which was written looking at these books:
 * "after correction" numbers are in-sample and measure the rulebook, not the AI.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DECISIONS, loadDataset } from "./dataset.ts"
import type { DeterministicFacts } from "./facts.ts"
import { decide, type SemanticFacts } from "./rules.ts"

const FACTS = ["genre", "exercises", "composition", "diagrams"] as const
const IRREVERSIBLE = ["pageGrouping", "figureExtraction"] as const
const HARD_FOR_NON_EXPERTS = ["renderStrategy", "sectioningMode", "figureExtraction"] as const

const [datasetFile, dir] = process.argv.slice(2)
const dataset = loadDataset(datasetFile)
type Run = {
  bookId: string; variant: string; run: number; facts: DeterministicFacts
  settings: Record<string, { value: string }>
  trace: { semantic?: SemanticFacts; answers?: Record<string, { answer: string; confidence: string }>; flags?: string[]; given?: Record<string, string> }
}
const runs: Run[] = readdirSync(dir).filter((f) => /\.run\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))

function factsOf(r: Run): { semantic: SemanticFacts; flags: string[]; cards: string[] } | null {
  const t = r.trace
  const semantic = t.semantic ?? (t.answers ? (Object.fromEntries(Object.entries(t.answers).map(([k, v]) => [k, v.answer])) as unknown as SemanticFacts) : null)
  if (!semantic) return null
  const flags = t.flags ?? (t.answers ? Object.entries(t.answers).filter(([, v]) => v.confidence !== "high").map(([k]) => k) : [])
  const cards = FACTS.filter((f) => !t.given?.[f])
  return { semantic, flags: flags.filter((f) => cards.includes(f as never)), cards }
}

const truthOf = (bookId: string) => dataset.books.find((b) => b.id === bookId)!.facts as Record<string, string[]>
const book = (id: string) => dataset.books.find((b) => b.id === id)!
const fix = (s: SemanticFacts, truth: Record<string, string[]>, which: (f: string) => boolean) =>
  Object.fromEntries(FACTS.map((f) => [f, !truth[f].includes(s[f]) && which(f) ? truth[f][0] : s[f]])) as unknown as SemanticFacts

function scoreSettings(bookId: string, settings: Record<string, { value: string }>) {
  const b = book(bookId)
  let agree = 0, total = 0, irrWrong = 0
  for (const d of DECISIONS) {
    const label = b.labels[d]
    if (!label) continue
    total++
    if (settings[d].value === label) agree++
    else if ((IRREVERSIBLE as readonly string[]).includes(d)) irrWrong++
  }
  return { agree, total, irrWrong }
}

type Acc = { agree: number; total: number; diagAgree: number; diagTotal: number; irrWrong: number }
const acc = (): Acc => ({ agree: 0, total: 0, diagAgree: 0, diagTotal: 0, irrWrong: 0 })
const add = (a: Acc, bookId: string, settings: Record<string, { value: string }>) => {
  const s = scoreSettings(bookId, settings)
  if (book(bookId).diagnostic) { a.diagAgree += s.agree; a.diagTotal += s.total } else { a.agree += s.agree; a.total += s.total }
  a.irrWrong += s.irrWrong
}

function simulate(variant: string, rs: Run[], override?: (r: Run) => { semantic: SemanticFacts; flags: string[]; cards: string[] } | null) {
  let cardsShown = 0, flaggedShown = 0, wrong = 0, flagged = 0, wrongFlagged = 0, factCells = 0, runCount = 0
  const asIs = acc(), afterAll = acc(), afterFlagged = acc()
  const perBook: Record<string, { wrongFacts: string[][]; flags: string[][] }> = {}
  for (const r of rs) {
    const f = override ? override(r) : factsOf(r)
    if (!f) continue
    runCount++
    const truth = truthOf(r.bookId)
    const wrongFacts = f.cards.filter((q) => !truth[q].includes(f.semantic[q as keyof SemanticFacts]))
    cardsShown += f.cards.length
    flaggedShown += f.flags.length
    factCells += f.cards.length
    wrong += wrongFacts.length
    flagged += f.flags.length
    wrongFlagged += wrongFacts.filter((q) => f.flags.includes(q)).length
    ;(perBook[r.bookId] ??= { wrongFacts: [], flags: [] }).wrongFacts.push(wrongFacts)
    perBook[r.bookId].flags.push(f.flags)
    add(asIs, r.bookId, decide(r.facts, f.semantic))
    add(afterAll, r.bookId, decide(r.facts, fix(f.semantic, truth, () => true)))
    add(afterFlagged, r.bookId, decide(r.facts, fix(f.semantic, truth, (q) => f.flags.includes(q))))
  }
  if (!runCount) return null
  return {
    variant, runs: runCount, factCells, wrong, flagged, wrongFlagged,
    silentErrors: wrong - wrongFlagged,
    /** Share of wrong facts the variant flagged (recall) and share of flags that were wrong (precision). */
    flagRecall: wrong ? wrongFlagged / wrong : null,
    flagPrecision: flagged ? wrongFlagged / flagged : null,
    reviewAll: { cardsPerBook: cardsShown / runCount, correctionsPerBook: wrong / runCount, settings: afterAll },
    reviewFlagged: { cardsPerBook: flaggedShown / runCount, correctionsPerBook: wrongFlagged / runCount, settings: afterFlagged },
    asIs, perBook,
  }
}

const variantIds = [...new Set(runs.map((r) => r.variant))].sort()
const factVariants = variantIds.map((v) => simulate(v, runs.filter((r) => r.variant === v))).filter((x) => x !== null)

// Offline cross-check: e5's page-count facts, flagged wherever the same-numbered e4 run disagrees.
const cross = (e4: string, e5: string, name: string) => {
  const pair = (r: Run) => {
    const other = runs.find((x) => x.variant === e4 && x.bookId === r.bookId && x.run === r.run)
    const a = factsOf(r), b = other && factsOf(other)
    if (!a || !b) return null
    const disagree = FACTS.filter((q) => a.semantic[q] !== b.semantic[q])
    return { semantic: a.semantic, flags: [...new Set([...a.flags.filter((q) => q === "genre"), ...disagree])], cards: [...FACTS] }
  }
  return simulate(name, runs.filter((r) => r.variant === e5), pair)
}
const crossChecks = [cross("e4-one-call", "e5-page-types", "x-e4-e5-crosscheck"), cross("e4-one-call@gpt-5.4", "e5-page-types@gpt-5.4", "x-e4-e5-crosscheck@gpt-5.4")].filter((x) => x !== null)

// Teaching chat: 6 settings, each explained and confirmed; corrections = labelled settings that differ.
const teach = variantIds.map((v) => {
  const rs = runs.filter((r) => r.variant === v)
  let corrections = 0, hard = 0, labelled = 0
  for (const r of rs) for (const d of DECISIONS) {
    const label = book(r.bookId).labels[d]
    if (!label) continue
    labelled++
    if (r.settings[d].value !== label) { corrections++; if ((HARD_FOR_NON_EXPERTS as readonly string[]).includes(d)) hard++ }
  }
  return { variant: v, runs: rs.length, questionsPerBook: DECISIONS.length, correctionsPerBook: corrections / rs.length, hardCorrectionsPerBook: hard / rs.length, labelledPerBook: labelled / rs.length }
})

// Rule ceiling: the rulebook fed the true facts. In-sample by construction.
const ceiling = dataset.books.filter((b) => b.facts).map((b) => {
  const r = runs.find((x) => x.bookId === b.id && x.facts)!
  const truth = Object.fromEntries(FACTS.map((f) => [f, (b.facts as Record<string, string[]>)[f][0]])) as unknown as SemanticFacts
  const s = decide(r.facts, truth)
  return { bookId: b.id, diagnostic: !!b.diagnostic, ...scoreSettings(b.id, s), settings: Object.fromEntries(DECISIONS.map((d) => [d, s[d].value])) }
})

writeFileSync(path.join(dir, "simulation.json"), JSON.stringify({ generatedAt: new Date().toISOString(), factVariants: [...factVariants, ...crossChecks], teach, ceiling }, null, 2))
const pct = (x: number | null) => (x === null ? "  - " : `${Math.round(x * 100)}%`.padStart(4))
console.log("variant                      wrong/facts  flagged  recall precision  silent  | review-all: corr/book settings | review-flagged: cards/book settings")
for (const s of [...factVariants, ...crossChecks]) {
  console.log(
    `${s.variant.padEnd(28)} ${`${s.wrong}/${s.factCells}`.padStart(8)}  ${String(s.flagged).padStart(6)}  ${pct(s.flagRecall)}  ${pct(s.flagPrecision)}     ${String(s.silentErrors).padStart(4)}  | ${s.reviewAll.correctionsPerBook.toFixed(2)}  ${s.reviewAll.settings.agree}/${s.reviewAll.settings.total} | ${s.reviewFlagged.cardsPerBook.toFixed(2)}  ${s.reviewFlagged.settings.agree}/${s.reviewFlagged.settings.total} (as is ${s.asIs.agree}/${s.asIs.total}, diag ${s.asIs.diagAgree}/${s.asIs.diagTotal})`,
  )
}
console.log("\nteaching chat (6 questions/book):")
for (const t of teach) console.log(`${t.variant.padEnd(28)} corrections/book ${t.correctionsPerBook.toFixed(2)} (expert-only ${t.hardCorrectionsPerBook.toFixed(2)})`)
console.log("\nrule ceiling (true facts -> rules):", ceiling.map((c) => `${c.bookId.slice(0, 18)} ${c.agree}/${c.total}`).join("  "))
