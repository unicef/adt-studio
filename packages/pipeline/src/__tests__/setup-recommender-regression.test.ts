/**
 * Regression table for the setup recommender's rulebook and ask policy (issue
 * #333). The fact sets the two AI readings produced in the saved engine runs
 * (14 books x 2 models x 3 runs, two rounds) are frozen in
 * fixtures/setup-recommender-runs.json together with the settings the user
 * says are right. decide() and factQuestions() are pure, so any rule change is
 * scored here in milliseconds, without AI.
 *
 * History (judged settings right, before any question is answered):
 *   saved runs (rules as they ran)              r2 474/486   r1 461/486
 *   + scanned story, words beside pictures -> overlay (Capitulo 01)
 *                                               r2 477/486   r1 463/486
 *   + Sectioning Dynamic for every school book (the preset decides it, not
 *     the exercises)                            r2 477/486   r1 462/486
 *   + Activities in a school book with "some" exercises need measured
 *     exercise cues when the words can be measured (Elements: 34 of 425
 *     pages; Arquitetura 42/238, Matematica 35/78, Praticas 118/210)
 *                                               r2 483/486   r1 467/486
 * Questions per run: saved r2 0.48 (40). Ask only when the second opinion
 * moves a setting, under either reading: r2 0.14 (12), r1 0.18 (15), with
 * no silent miss in r2 (r1's 12 silent misses are the pre-fix page grouping).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { MeasuredFacts } from "../setup-recommender/facts.js"
import { factQuestions } from "../setup-recommender/recommend.js"
import { BOOK_FACT_OPTIONS, SETTING_IDS, decide, type BookFactId, type BookFacts, type SettingId } from "../setup-recommender/rules.js"

interface FixtureBook {
  title: string
  pages: number
  right: Partial<Record<SettingId, string | boolean>>
  alsoRight: Partial<Record<SettingId, (string | boolean)[]>>
  exerciseCues: { pagesWithCues: number; interiorPages: number; value: boolean }
  textOverPicturesShare: number
}
interface FixtureRun {
  book: string
  model: string
  run: number
  measured: {
    pageStorage: MeasuredFacts["pageStorage"]["value"]
    via: MeasuredFacts["pageStorage"]["via"]
    textLayer: MeasuredFacts["textLayer"]["value"]
    vectorDiagrams: boolean
    medianChars: number
  }
  proposal: BookFacts
  second: BookFacts | null
  asked: BookFactId[]
  saved: Record<SettingId, string | boolean>
}
const fixture = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "setup-recommender-runs.json"), "utf8"),
) as { books: Record<string, FixtureBook>; rounds: Record<"r1" | "r2", FixtureRun[]> }

function measuredFor(r: FixtureRun): MeasuredFacts {
  const book = fixture.books[r.book]
  // The saved runs keep only the text layer's kind, not the scanned-page count, so a "mixed" book
  // would replay as all scanned (hasTextLayer false). No saved run is "mixed", so nothing is off
  // today; a mixed book in the fixture would need its real count saved with the run.
  const scanned = r.measured.textLayer === "digital" ? 0 : book.exerciseCues.interiorPages
  return {
    pageStorage: { value: r.measured.pageStorage, via: r.measured.via, evidence: [], seams: 0, pairs: 0, wideShare: 0 },
    textLayer: { value: r.measured.textLayer, evidence: [], scannedPages: scanned, ocrPages: 0, pages: book.exerciseCues.interiorPages },
    textOverPictures: { value: book.textOverPicturesShare >= 0.4, share: book.textOverPicturesShare, evidence: [] },
    pictureHeavy: { value: false, medianCoverage: 0 },
    textDensity: { medianChars: r.measured.medianChars, class: "medium" },
    vectorDiagrams: { value: r.measured.vectorDiagrams, pagesWithDiagrams: 0, evidence: [] },
    exerciseCues: { value: book.exerciseCues.value, pagesWithCues: book.exerciseCues.pagesWithCues, evidence: [] },
    language: { pdfTag: null, guess: null },
  }
}

const isRight = (book: FixtureBook, id: SettingId, v: string | boolean) =>
  book.right[id] === v || (book.alsoRight[id] ?? []).includes(v)

function score(round: "r1" | "r2", settingsOf: (r: FixtureRun) => Record<SettingId, string | boolean>) {
  const per = Object.fromEntries(SETTING_IDS.map((id) => [id, { right: 0, judged: 0 }])) as Record<SettingId, { right: number; judged: number }>
  let fullyRight = 0
  const misses: string[] = []
  for (const r of fixture.rounds[round]) {
    const book = fixture.books[r.book]
    const s = settingsOf(r)
    let all = true
    for (const id of SETTING_IDS) {
      if (book.right[id] === undefined) continue
      per[id].judged++
      if (isRight(book, id, s[id])) per[id].right++
      else {
        all = false
        misses.push(`${r.book} ${r.model} run${r.run}: ${id}=${String(s[id])}`)
      }
    }
    if (all) fullyRight++
  }
  const right = SETTING_IDS.reduce((n, id) => n + per[id].right, 0)
  const judged = SETTING_IDS.reduce((n, id) => n + per[id].judged, 0)
  const perSetting = Object.fromEntries(SETTING_IDS.map((id) => [id, `${per[id].right}/${per[id].judged}`]))
  return { right, judged, fullyRight, perSetting, misses }
}

const current = (r: FixtureRun) => {
  const d = decide(measuredFor(r), r.proposal)
  return Object.fromEntries(SETTING_IDS.map((id) => [id, d[id].value])) as Record<SettingId, string | boolean>
}

/** A miss the user can fix by answering the questions asked (some answer to them gives the right value). */
function fixableByAsking(r: FixtureRun, asked: BookFactId[], id: SettingId): boolean {
  const book = fixture.books[r.book]
  const m = measuredFor(r)
  const combos = asked.reduce<Partial<BookFacts>[]>(
    (acc, f) => acc.flatMap((c) => (BOOK_FACT_OPTIONS[f] as string[]).map((o) => ({ ...c, [f]: o }))),
    [{}],
  )
  return combos.some((c) => isRight(book, id, decide(m, { ...r.proposal, ...c } as BookFacts)[id].value))
}

describe("setup recommender regression table (saved runs x the user's right settings)", () => {
  it("scores the saved runs as they ran (baseline)", () => {
    expect(fixture.rounds.r2).toHaveLength(84)
    expect(fixture.rounds.r1).toHaveLength(84)
    expect(score("r2", (r) => r.saved).right).toBe(474)
    expect(score("r1", (r) => r.saved).right).toBe(461)
    expect(score("r2", (r) => r.saved).judged).toBe(486)
    const asked = fixture.rounds.r2.reduce((n, r) => n + r.asked.length, 0)
    expect(asked).toBe(40) // 0.48 questions per run
  })

  it("round 2 with the current rulebook", () => {
    const s = score("r2", current)
    expect(s.perSetting).toEqual({
      preset: "84/84",
      renderStrategy: "81/84",
      pageGrouping: "84/84",
      sectioningMode: "84/84",
      activitiesGenerator: "84/84",
      figureExtraction: "66/66",
    })
    expect(s.right).toBe(483)
    expect(s.fullyRight).toBe(81)
    // The three left: LP-4 Volcanoes read as words beside the pictures (a reading, not a rule).
    expect(s.misses.every((m) => m.startsWith("lp-4-volcanoes") && m.includes("renderStrategy"))).toBe(true)
  })

  it("round 1 with the current rulebook", () => {
    const s = score("r1", current)
    expect(s.perSetting).toEqual({
      // Elements read as a reference book once, Biomolecules as a school book once.
      preset: "82/84",
      renderStrategy: "81/84",
      // Round 1 ran before the facing-pages fix (LP-4 Volcanoes, Triste): a measured fact, not a rule.
      pageGrouping: "72/84",
      sectioningMode: "82/84",
      activitiesGenerator: "84/84",
      figureExtraction: "66/66",
    })
    expect(s.right).toBe(467)
  })

  it("asks only about facts whose second opinion changes a setting, and counts the misses nobody is asked about (none in r2)", () => {
    for (const round of ["r1", "r2"] as const) {
      let questions = 0
      let silentMisses = 0
      let askedMisses = 0
      for (const r of fixture.rounds[round]) {
        const m = measuredFor(r)
        const asks = factQuestions(m, r.proposal, r.second, false).filter((q) => q.askReason !== null)
        questions += asks.length
        for (const q of asks) {
          // A question is only put when the other reading's answer moves a setting.
          const other = { ...r.proposal, [q.id]: r.second![q.id] } as BookFacts
          const a = decide(m, r.proposal)
          const b = decide(m, other)
          const c = decide(m, r.second!)
          const d = decide(m, { ...r.second!, [q.id]: r.proposal[q.id] } as BookFacts)
          expect(SETTING_IDS.some((id) => a[id].value !== b[id].value || c[id].value !== d[id].value)).toBe(true)
        }
        const s = current(r)
        for (const id of SETTING_IDS) {
          const book = fixture.books[r.book]
          if (book.right[id] === undefined || isRight(book, id, s[id])) continue
          if (fixableByAsking(r, asks.map((q) => q.id), id)) askedMisses++
          else silentMisses++
        }
      }
      QUESTIONS[round] = { questions, perRun: +(questions / 84).toFixed(2), silentMisses, askedMisses }
    }
    expect(QUESTIONS).toEqual(EXPECTED_QUESTIONS)
  })
})

const QUESTIONS: Record<string, unknown> = {}
const EXPECTED_QUESTIONS = {
  r1: { questions: 15, perRun: 0.18, silentMisses: 12, askedMisses: 7 },
  r2: { questions: 12, perRun: 0.14, silentMisses: 0, askedMisses: 3 },
}
