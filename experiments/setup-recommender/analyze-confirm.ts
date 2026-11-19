/**
 * Offline (no LLM calls). "Show the AI's picks, ask only if needed": asking policies for a REVIEW screen.
 *   tsx analyze-confirm.ts <dataset.json> <results-dir> [out.json]  -> <results-dir>/confirm-policies.json
 *
 * A proposal reading P gives the picks shown on the review screen. A check reading C (another run, same or
 * other variant) is the second opinion. A policy decides which picks become questions (must be answered before
 * Create), which are highlighted "please check" (pre-filled, no answer needed), and which are shown as sure.
 * An honest user (the dataset's true facts) answers every question right and does NOT edit anything else:
 * that is the worst case for a review screen, where people tend to click "Looks right".
 *
 * Policies:
 *   P0  never ask; every pick shown as sure (the user must spot errors)
 *   P1  ask a fact when P and C disagree AND some other answer would change a setting
 *   P2  P1 + ask every fact that can change a setting when the proposal read < 2 pages of the book itself
 *       (from whichever reading labels pages: E5, E11, E12)
 *   P3  P2 + always ask diagrams when it decides the locked Figures setting
 *   P4  ask only a fact that decides a locked setting, and only when unsure (P2's "unsure");
 *       other unsure facts that matter are highlighted, not asked
 *
 * Measures, per policy:
 *   questions per book (mean over run pairs, max)
 *   silent errors: settings still wrong at Create (vs decide(measured, true facts)), split locked / changeable;
 *     for P4 also how many of them sat in a highlighted row (the user was warned but not made to answer)
 *   wrong picks shown as sure: wrong facts neither asked nor highlighted, and how many of those change a setting
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
const POLICIES = ["P0", "P1", "P2", "P3", "P4"] as const
type Policy = (typeof POLICIES)[number]

const [datasetFile, dir, outArg] = process.argv.slice(2)
const dataset = loadDataset(datasetFile)
type Run = { bookId: string; variant: string; run: number; facts: DeterministicFacts; trace: { semantic: SemanticFacts; counts?: { body: number } } }
const runs: Run[] = readdirSync(dir).filter((f) => /\.run\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8"))).filter((r) => r.trace?.semantic)

const PAIRS: [string, string][] = [
  ["e5-page-types", "e4-one-call"], // the prototypes' engine (round 2-3 screens)
  ["e5-page-types", "e10-plain-words"], // = E12 / E13 on short books: the recommended engine
  ["e5-page-types", "e6-text-only"],
  ["e5-page-types", "e14-middle-lite"],
  ["e5-page-types", "e11-page-types-text"],
  ["e5-page-types", "e5-page-types"],
  ["e4-one-call", "e5-page-types"], // the whole-book reading as the shown pick (El Viaje's "AI wrong" screens)
  ["e10-plain-words", "e5-page-types"],
  ["e11-page-types-text", "e6-text-only"], // no images at all
  ["e11-page-types-text", "e10-plain-words"],
  ["e5-page-types@gpt-5.4", "e4-one-call@gpt-5.4"],
  ["e12-sampled", "e13-plain-words-middle"], // whole books
  ["e12-sampled", "e4-one-call"],
  ["e12-sampled", "e10-plain-words"],
  ["e12-sampled", "e14-middle-lite"],
  ["e12j-sampled-jpeg", "e13-plain-words-middle"],
  ["e12t-sampled-text", "e13-plain-words-middle"],
]

const diffSettings = (m: DeterministicFacts, a: SemanticFacts, b: SemanticFacts) => {
  const x = decide(m, a), y = decide(m, b)
  return DECISIONS.filter((d) => x[d].value !== y[d].value)
}
const with1 = (s: SemanticFacts, f: F, o: string) => ({ ...s, [f]: o }) as SemanticFacts
/** Settings that some other answer to f would change, given the rest of the picks. */
const varies = (m: DeterministicFacts, s: SemanticFacts, f: F) => [...new Set(OPTIONS[f].flatMap((o) => diffSettings(m, s, with1(s, f, o))))]

function classify(policy: Policy, m: DeterministicFacts, p: Run, c: Run) {
  const P = p.trace.semantic, C = c.trace.semantic
  // coverage comes from whichever reading labels pages (the engine always has one)
  const counts = p.trace.counts ?? c.trace.counts
  const lowCover = counts !== undefined && counts.body < 2
  const asked: F[] = [], highlighted: F[] = []
  for (const f of FACTS) {
    const v = varies(m, P, f), matters = v.length > 0, split = P[f] !== C[f]
    const decidesLocked = v.some((d) => LOCKED.includes(d))
    const unsure = split || lowCover
    let ask = false, hl = false
    switch (policy) {
      case "P0": break
      case "P1": ask = matters && split; break
      case "P2": ask = matters && unsure; break
      case "P3": ask = (matters && unsure) || (f === "diagrams" && decidesLocked); break
      case "P4": ask = unsure && decidesLocked; hl = !ask && unsure && matters; break
    }
    if (ask) asked.push(f)
    else if (hl) highlighted.push(f)
  }
  return { asked, highlighted }
}

const out: any = {
  generatedAt: new Date().toISOString(),
  note: "Offline replay, no LLM calls. Honest user answers questions right and edits nothing else. Silent error = a setting at Create that differs from decide(measured, true facts).",
  policies: {
    P0: "never ask; every pick shown as sure",
    P1: "ask when readings disagree AND another answer changes a setting",
    P2: "P1 + ask every fact that matters when only opening pages were read (< 2 body pages)",
    P3: "P2 + always ask diagrams when it decides the locked Figures setting",
    P4: "ask only facts that decide a locked setting, when unsure; highlight other unsure facts that matter without asking",
  },
  pairs: [] as any[],
}

for (const [pv, cv] of PAIRS) {
  const pol: any = {}
  for (const policy of POLICIES) {
    const t = { combos: 0, questions: 0, maxQ: 0, highlighted: 0, combosWithSilent: 0, silentChangeable: 0, silentLocked: 0, silentInHighlightedRow: 0, wrongShownSure: 0, wrongShownSureThatMatter: 0, wrongAsked: 0, rightAsked: 0 }
    const books: Record<string, { questions: number[]; silent: Record<string, number>; wrongShownSure: string[] }> = {}
    for (const b of dataset.books) {
      const truth = b.facts as Record<F, string[]>
      const P = runs.filter((r) => r.bookId === b.id && r.variant === pv)
      const C = runs.filter((r) => r.bookId === b.id && r.variant === cv)
      for (const p of P) for (const c of C) {
        if (pv === cv && p.run === c.run) continue
        const m = p.facts, S = p.trace.semantic
        const { asked, highlighted } = classify(policy, m, p, c)
        const wrong = (f: F) => !truth[f].includes(S[f])
        const final = Object.fromEntries(FACTS.map((f) => [f, asked.includes(f) && wrong(f) ? truth[f][0] : S[f]])) as unknown as SemanticFacts
        const ideal = Object.fromEntries(FACTS.map((f) => [f, truth[f].includes(final[f]) ? final[f] : truth[f][0]])) as unknown as SemanticFacts
        const miss = diffSettings(m, final, ideal)
        // which wrong facts caused the misses, and was any of them highlighted
        const wrongLeft = FACTS.filter((f) => !asked.includes(f) && wrong(f))
        const inHl = wrongLeft.filter((f) => highlighted.includes(f) && diffSettings(m, final, with1(final, f, truth[f][0])).length > 0)
        const shownSure = wrongLeft.filter((f) => !highlighted.includes(f))
        t.combos++; t.questions += asked.length; t.maxQ = Math.max(t.maxQ, asked.length); t.highlighted += highlighted.length
        t.wrongAsked += asked.filter(wrong).length; t.rightAsked += asked.filter((f) => !wrong(f)).length
        if (miss.length) t.combosWithSilent++
        t.silentLocked += miss.filter((d) => LOCKED.includes(d)).length
        t.silentChangeable += miss.filter((d) => !LOCKED.includes(d)).length
        t.silentInHighlightedRow += inHl.length ? miss.length : 0
        t.wrongShownSure += shownSure.length
        t.wrongShownSureThatMatter += shownSure.filter((f) => diffSettings(m, final, with1(final, f, truth[f][0])).length > 0).length
        const bk = (books[b.id] ??= { questions: [], silent: {}, wrongShownSure: [] })
        bk.questions.push(asked.length)
        for (const d of miss) bk.silent[d] = (bk.silent[d] ?? 0) + 1
        for (const f of shownSure) bk.wrongShownSure.push(`r${p.run}/${c.run} ${f}=${S[f]}`)
      }
    }
    if (!t.combos) continue
    pol[policy] = {
      ...t,
      questionsMean: +(t.questions / t.combos).toFixed(2),
      highlightedMean: +(t.highlighted / t.combos).toFixed(2),
      silent: `${t.combosWithSilent}/${t.combos}`,
      books: Object.fromEntries(Object.entries(books).map(([id, v]) => [id, { mean: +(v.questions.reduce((a, x) => a + x, 0) / v.questions.length).toFixed(2), max: Math.max(...v.questions), silent: v.silent, wrongShownSure: v.wrongShownSure }])),
    }
  }
  if (Object.keys(pol).length) out.pairs.push({ proposal: pv, check: cv, policies: pol })
}

const outFile = outArg ?? path.join(dir, "confirm-policies.json")
writeFileSync(outFile, JSON.stringify(out, null, 1))
console.log("proposal / check".padEnd(44), POLICIES.map((p) => p.padEnd(22)).join(""))
for (const pr of out.pairs) console.log(`${pr.proposal} / ${pr.check}`.padEnd(44), POLICIES.map((p) => {
  const x = pr.policies[p]
  return x ? `${x.questionsMean}q≤${x.maxQ} s${x.silent} L${x.silentLocked} w${x.wrongShownSureThatMatter}`.padEnd(22) : "".padEnd(22)
}).join(""))
console.log("\nq = questions per book (mean ≤ max), s = run pairs with a silent error, L = locked settings wrong at Create, w = wrong picks that change a setting shown as sure")
