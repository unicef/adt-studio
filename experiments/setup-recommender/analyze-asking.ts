/**
 * Offline (no LLM calls). "When do we ask the user?" replayed on every saved run.
 *   tsx analyze-asking.ts <dataset.json> <results-dir>  -> <results-dir>/asking.json
 *
 * A proposal reading P (one run of one variant) gives the facts; a check reading C (another run, same or other
 * variant) is the second opinion. An asking rule picks which facts to put to the user. An honest user (the
 * dataset's hand-labelled true facts) answers them. Then the rulebook gives the settings.
 *
 * Rules compared:
 *   none          never ask (the proposal as is)
 *   disagree      ask every fact where P and C differ
 *   changes       designer's rule: ask a fact only if C's answer would change a setting
 *   changes+cover "changes", plus: when the proposal read fewer than 2 story/lesson/info pages (E5-style
 *                 readings only), ask every fact that can still change a setting ("What comes after these pages?")
 *   changes+open  Ana's mixed flow: as "changes", but once anything is asked, ask every fact that matters
 *   changes+diag  "changes", plus always confirm diagrams when that answer decides the locked Figures setting
 *   all-matter    ask every fact that can change a setting for this book (adaptive chat)
 *
 * "Missed" = a setting that still differs from what the true facts give (decide(measured, truth)), i.e. an error
 * the engine let through without asking. Counted against the rulebook's own output, so it measures the asking,
 * not the rulebook (which is in-sample on these books).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DECISIONS, loadDataset } from "./dataset.ts"
import type { DeterministicFacts } from "./facts.ts"
import { decide, type SemanticFacts } from "./rules.ts"

const FACTS = ["genre", "exercises", "composition", "diagrams"] as const
type F = (typeof FACTS)[number]
const OPTIONS: Record<F, string[]> = {
  genre: ["story", "textbook", "reference"],
  exercises: ["none", "some", "many"],
  composition: ["text-in-art", "text-beside-art", "text-mostly"],
  diagrams: ["none", "some", "many"],
}
const LOCKED = ["pageGrouping", "figureExtraction"]

const [datasetFile, dir] = process.argv.slice(2)
const dataset = loadDataset(datasetFile)
type Run = { bookId: string; variant: string; run: number; facts: DeterministicFacts; trace: { semantic: SemanticFacts; counts?: { body: number } } }
const runs: Run[] = readdirSync(dir).filter((f) => /\.run\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8"))).filter((r) => r.trace?.semantic)

const READINGS = ["e4-one-call", "e5-page-types", "e6-text-only", "e10-plain-words", "e11-page-types-text", "e4-one-call@gpt-5.4", "e5-page-types@gpt-5.4", "e12-sampled", "e12t-sampled-text", "e13-plain-words-middle", "e14-middle-lite", "e12j-sampled-jpeg"]
const PAIRS: [string, string][] = [
  ["e5-page-types", "e5-page-types"], // two runs of the same reading
  ["e5-page-types", "e4-one-call"], // the designer's prototype pair
  ["e5-page-types", "e10-plain-words"],
  ["e5-page-types", "e11-page-types-text"],
  ["e5-page-types", "e6-text-only"],
  ["e11-page-types-text", "e6-text-only"], // no images at all
  ["e11-page-types-text", "e10-plain-words"],
  ["e10-plain-words", "e11-page-types-text"],
  ["e4-one-call", "e4-one-call"],
  ["e5-page-types@gpt-5.4", "e4-one-call@gpt-5.4"],
  // Round 3, whole books (results/whole): E12 labels a page sample; E4/E10 read 6 chosen pages.
  ["e12-sampled", "e4-one-call"],
  ["e12-sampled", "e10-plain-words"],
  ["e12-sampled", "e12t-sampled-text", "e13-plain-words-middle", "e14-middle-lite", "e12j-sampled-jpeg"],
  ["e12t-sampled-text", "e10-plain-words"],
  ["e12-sampled", "e13-plain-words-middle"],
  ["e12t-sampled-text", "e13-plain-words-middle", "e14-middle-lite", "e12j-sampled-jpeg"],
  ["e5-page-types", "e14-middle-lite"],
  ["e12-sampled", "e14-middle-lite"],
  ["e12j-sampled-jpeg", "e13-plain-words-middle"],
  ["e12j-sampled-jpeg", "e14-middle-lite"],
]
const RULES = ["none", "disagree", "changes", "changes+cover", "changes+open", "changes+diag", "all-matter"] as const

const diffSettings = (m: DeterministicFacts, a: SemanticFacts, b: SemanticFacts) => {
  const x = decide(m, a), y = decide(m, b)
  return DECISIONS.filter((d) => x[d].value !== y[d].value)
}
/** Facts for which some other answer would change a setting, given the rest of the reading. */
const matters = (m: DeterministicFacts, s: SemanticFacts) => FACTS.filter((f) => OPTIONS[f].some((o) => diffSettings(m, s, { ...s, [f]: o } as SemanticFacts).length > 0))
/** Diagrams decides the locked Figures setting (no vector diagrams measured, digital text). */
const diagramsDecidesLocked = (m: DeterministicFacts, s: SemanticFacts) =>
  OPTIONS.diagrams.some((o) => diffSettings(m, s, { ...s, diagrams: o } as SemanticFacts).includes("figureExtraction"))

function ask(rule: (typeof RULES)[number], m: DeterministicFacts, p: Run, c: Run): F[] {
  const P = p.trace.semantic, C = c.trace.semantic
  const disagree = FACTS.filter((f) => P[f] !== C[f])
  const changes = disagree.filter((f) => diffSettings(m, P, { ...P, [f]: C[f] } as SemanticFacts).length > 0)
  const mat = matters(m, P)
  const lowCover = p.trace.counts !== undefined && p.trace.counts.body < 2
  switch (rule) {
    case "none": return []
    case "disagree": return disagree
    case "changes": return changes
    case "changes+cover": return lowCover ? mat : changes
    case "changes+open": return changes.length ? mat : []
    case "changes+diag": return [...new Set([...changes, ...(diagramsDecidesLocked(m, P) ? (["diagrams"] as F[]) : [])])]
    case "all-matter": return mat
  }
}

const out: any = { generatedAt: new Date().toISOString(), note: "Offline replay. Honest user = dataset's true facts. 'missed' = settings that differ from what the true facts give.", pairs: [] as any[] }
for (const [pv, cv] of PAIRS) {
  const books: any[] = []
  const totals = Object.fromEntries(RULES.map((r) => [r, { combos: 0, questions: 0, maxQ: 0, combosMissed: 0, settingsMissed: 0, lockedMissed: 0, wrongAnswersAsked: 0, rightAnswersAsked: 0 }]))
  for (const b of dataset.books) {
    const truth = b.facts as Record<F, string[]>
    const P = runs.filter((r) => r.bookId === b.id && r.variant === pv)
    const C = runs.filter((r) => r.bookId === b.id && r.variant === cv)
    const perRule: any = {}
    for (const rule of RULES) {
      const qs: number[] = []
      const missed: Record<string, number> = {}
      let combos = 0
      for (const p of P) for (const c of C) {
        if (pv === cv && p.run === c.run) continue
        combos++
        const m = p.facts
        const asked = ask(rule, m, p, c)
        const answered = Object.fromEntries(FACTS.map((f) => [f, asked.includes(f) && !truth[f].includes(p.trace.semantic[f]) ? truth[f][0] : p.trace.semantic[f]])) as unknown as SemanticFacts
        const ideal = Object.fromEntries(FACTS.map((f) => [f, truth[f].includes(answered[f]) ? answered[f] : truth[f][0]])) as unknown as SemanticFacts
        const miss = diffSettings(m, answered, ideal)
        const t = totals[rule]
        t.combos++; t.questions += asked.length; t.maxQ = Math.max(t.maxQ, asked.length)
        t.wrongAnswersAsked += asked.filter((f) => !truth[f].includes(p.trace.semantic[f])).length
        t.rightAnswersAsked += asked.filter((f) => truth[f].includes(p.trace.semantic[f])).length
        if (miss.length) { t.combosMissed++; t.settingsMissed += miss.length; t.lockedMissed += miss.filter((d) => LOCKED.includes(d)).length }
        qs.push(asked.length)
        for (const d of miss) missed[d] = (missed[d] ?? 0) + 1
      }
      perRule[rule] = { combos, questions: qs, avgQuestions: qs.reduce((a, x) => a + x, 0) / Math.max(1, qs.length), missed }
    }
    books.push({ id: b.id, perRule })
  }
  if (totals.none.combos === 0) continue
  out.pairs.push({
    proposal: pv, check: cv,
    rules: Object.fromEntries(RULES.map((r) => {
      const t = totals[r]
      return [r, { ...t, avgQuestions: +(t.questions / Math.max(1, t.combos)).toFixed(2), combosWithMiss: `${t.combosMissed}/${t.combos}` }]
    })),
    books,
  })
}

// Single readings, no check: how often each fact is wrong, and how often the wrong fact changes a setting.
out.readings = READINGS.filter((v) => runs.some((r) => r.variant === v)).map((v) => {
  const rs = runs.filter((r) => r.variant === v)
  const wrong = Object.fromEntries(FACTS.map((f) => [f, 0]))
  const wrongThatMatters = Object.fromEntries(FACTS.map((f) => [f, 0]))
  const where: string[] = []
  for (const r of rs) {
    const truth = dataset.books.find((b) => b.id === r.bookId)!.facts as Record<F, string[]>
    for (const f of FACTS) if (!truth[f].includes(r.trace.semantic[f])) {
      wrong[f]++
      const fixed = { ...r.trace.semantic, [f]: truth[f][0] } as SemanticFacts
      const d = diffSettings(r.facts, r.trace.semantic, fixed)
      if (d.length) wrongThatMatters[f]++
      where.push(`${r.bookId.split("-").slice(1, 3).join("-")} r${r.run} ${f}=${r.trace.semantic[f]}${d.length ? ` -> ${d.join(",")}` : " (no setting changes)"}`)
    }
  }
  return { variant: v, runs: rs.length, wrong, wrongThatMatters, where }
})

// Diagrams: does the AI's answer ever decide the locked Figures setting, and is it ever wrong there?
out.diagrams = dataset.books.map((b) => {
  const r = runs.find((x) => x.bookId === b.id)!
  const decides = diagramsDecidesLocked(r.facts, { genre: "story", exercises: "none", composition: "text-mostly", diagrams: "none" })
  const answers = READINGS.map((v) => ({ v, a: runs.filter((x) => x.bookId === b.id && x.variant === v).map((x) => x.trace.semantic.diagrams) }))
  const wrong = answers.flatMap(({ v, a }) => a.filter((x) => !(b.facts as Record<F, string[]>).diagrams.includes(x)).map(() => v))
  return { book: b.id, measuredVectorDiagrams: r.facts.vectorDiagrams.value, textLayer: r.facts.textLayer.value, aiAnswerDecidesFigures: decides, truth: (b.facts as any).diagrams, answers, wrongRuns: wrong.length, wrongIn: wrong }
})

writeFileSync(path.join(dir, "asking.json"), JSON.stringify(out, null, 1))
console.log("proposal / check".padEnd(48), RULES.map((r) => r.padEnd(14)).join(""))
for (const p of out.pairs) console.log(`${p.proposal} / ${p.check}`.padEnd(48), RULES.map((r) => `${p.rules[r].avgQuestions}q ${p.rules[r].combosWithMiss}`.padEnd(14)).join(""))
console.log("\nwrong facts per reading (all runs):")
for (const r of out.readings) console.log(r.variant.padEnd(24), JSON.stringify(r.wrong), "matter:", JSON.stringify(r.wrongThatMatters))
for (const r of out.readings) for (const w of r.where) console.log("  ", r.variant, w)
console.log("\ndiagrams:")
for (const d of out.diagrams) console.log(d.book.slice(0, 30).padEnd(32), "vectors", d.measuredVectorDiagrams, "AI decides Figures:", d.aiAnswerDecidesFigures, "wrong runs:", d.wrongRuns, d.wrongIn.join(","))
