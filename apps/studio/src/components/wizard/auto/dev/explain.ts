/* eslint-disable lingui/no-unlocalized-strings -- dev-only explanations for developers (development builds only) */
import type { SetupBookFactId, SetupRecommendation, SetupSettingId } from "@adt/types"
import { FACT_IDS, FACT_OPTIONS, SETTING_IDS, settingsFor, type FactAnswers } from "../engine/answers"
import type { Source } from "../guided/shared/useAnswers"
import { WIZARD_NAME, wizardValue } from "./parts"

/**
 * Why the engine decided what it did, decision by decision, in plain developer words: each setting
 * with the rule that fired, the inputs that rule read (facts and PDF measurements) and the answers
 * that would have flipped it; each fact traced from the page labels (reading A) and the questions
 * (reading B) to the value used. Built for diagnosing wrong picks. Mirrors packages/pipeline's
 * setup-recommender (rules.ts decide(), readings.ts countLabels(), recommend.ts breakTies()).
 * "Would be different if" reads the engine's own table for this run (settingsByFacts), so it
 * stays true to the rules the run was made with, even after the rules change.
 */

export type Input = { label: string; value: string; from: "fact" | "pdf"; note?: string }
export type Flip = { fact: SetupBookFactId; value: string; result: string }
export type SettingWhy = {
  /** When no single answer flips it: why. */
  noFlip: string
  id: SetupSettingId
  name: string
  final: string
  engine: string
  afterAnswers: string
  decidedBy: string
  rule: string
  why: string
  inputs: Input[]
  flips: Flip[]
  evidence: number[]
  locked: boolean
}
export type FactWhy = {
  id: SetupBookFactId
  question: string
  used: string
  engineGuess: string
  readingA: { value: string; lines: string[]; closeCall: boolean } | null
  readingB: { value: string; confidence: string; reason: string; pages: number[] } | null
  combined: string
  asked: string | null
  answer: string | null
  evidence: number[]
}

export const FACT_QUESTION: Record<SetupBookFactId, string> = {
  genre: "What is this book mostly?",
  exercises: "Does the book ask the reader to write or mark answers? (Colouring and drawing do not count.)",
  composition: "Where are the words on a page?",
  diagrams: "Are there pictures with labels that explain something, like maps, charts, diagrams or labelled drawings?",
}

const ASK_REASON: Record<string, string> = {
  "readings-disagree": "the two readings disagree and the other answer would change a setting",
  "few-body-pages": "too few pages of the book itself were seen",
  "one-reading": "only one reading came back, so nothing checked it",
}

const DECIDED_BY: Record<Source, string> = { ai: "engine (readings + rules)", asked: "your answers", changed: "changed by hand" }

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—")

const NON_VOTING = ["cover", "front-matter", "back-matter", "blank"]

/** Older runs kept only each page's type: recount what the types can tell (the kind of book, exercises). */
function readingAFromPageLabels(rec: SetupRecommendation, id: SetupBookFactId): FactWhy["readingA"] {
  if (!rec.pageLabels.length || (id !== "genre" && id !== "exercises")) return null
  const body = rec.pageLabels.filter((l) => !NON_VOTING.includes(l.type))
  const n = body.length
  const count = (...types: string[]) => body.filter((l) => types.includes(l.type)).length
  const value = rec.facts.find((f) => f.id === id)?.value ?? "—"
  const lines =
    id === "genre"
      ? [`Recounted from the saved page types (this run kept no full readings): ${n} body pages: story ${count("story")} · school ${count("lesson", "exercise")} · information ${count("informational")}.`]
      : [`Recounted from the saved page types: ${count("exercise")} of ${n} body pages labelled "exercise".`]
  return { value, lines, closeCall: false }
}

function readingA(rec: SetupRecommendation, id: SetupBookFactId): FactWhy["readingA"] {
  const l = rec.readings?.labels
  if (!l) return readingAFromPageLabels(rec, id)
  const c = l.counts
  const n = c.body
  const value = l.facts[id] ?? "—"
  const closeCall = l.flags.includes(id)
  const tie = l.ties[id]
  const lines: string[] = []
  const base = `${n} body page${n === 1 ? "" : "s"} voted (cover, front/back matter and blank pages don't vote)`
  if (id === "genre") {
    const top = Math.max(c.story, c.textbook, c.reference)
    lines.push(`${base}: story ${c.story} · school (lessons + exercises) ${c.textbook} · information ${c.reference}.`)
    if (n < 2) lines.push(`Too few body pages, so it used the reading's whole-book guess: ${l.bookGenre}.`)
    else if ([c.story, c.textbook, c.reference].filter((x) => x === top).length > 1) lines.push(`Tie for the top count, so it used the whole-book guess: ${l.bookGenre}.`)
    else lines.push(`Top answer has ${pct(top, n)} of the votes (under 60% counts as a close call).`)
  } else if (id === "exercises") {
    lines.push(`${base}; ${c.exercisePages} labelled "exercise" → none when 0, some when under half (${(n / 2).toFixed(1)}), many from half up.`)
  } else if (id === "composition") {
    const p = c.placement
    const total = (p["on-art"] ?? 0) + (p["beside-art"] ?? 0) + (p["text-only"] ?? 0)
    const top = Math.max(p["on-art"] ?? 0, p["beside-art"] ?? 0, p["text-only"] ?? 0)
    lines.push(`Pages with words: words on the picture ${p["on-art"] ?? 0} · beside the picture ${p["beside-art"] ?? 0} · mostly text ${p["text-only"] ?? 0}.`)
    lines.push(`Top placement has ${pct(top, total)} (under 60% counts as a close call).`)
  } else {
    lines.push(`${base}; ${c.figurePages} with a meaningful figure (labelled diagram, chart, map, table) → none when 0, some when under a third (${(n / 3).toFixed(1)}), many from a third up.`)
  }
  if (tie) lines.push(`Tied between: ${tie.join(", ")}.`)
  return { value, lines, closeCall }
}

function readingB(rec: SetupRecommendation, id: SetupBookFactId): FactWhy["readingB"] {
  const q = rec.readings?.questions?.answers?.[id]
  if (!q) {
    // Older runs kept the second reading's answer and reason on the fact itself.
    const f = rec.facts.find((x) => x.id === id)
    if (!f?.secondOpinion) return null
    return { value: f.secondOpinion, confidence: "not recorded", reason: f.reason ?? "", pages: f.evidencePages }
  }
  return { value: q.answer, confidence: q.confidence, reason: q.reason, pages: q.evidencePages }
}

function combined(rec: SetupRecommendation, id: SetupBookFactId, a: FactWhy["readingA"], b: FactWhy["readingB"], guess: string): string {
  if (a && b) {
    const tie = rec.readings?.labels?.ties[id]
    if (tie && tie.includes(b.value)) return `Reading A tied; reading B's answer (${b.value}) broke the tie → ${guess}.`
    return a.value === b.value ? `Both readings agree → ${guess}.` : `Reading A's ${a.value} is the proposal; reading B said ${b.value} (a disagreement).`
  }
  if (a) return `Only reading A came back${rec.readings?.errors?.questions ? ` (B failed: ${rec.readings.errors.questions})` : ""} → ${guess}.`
  if (b) return `Only reading B came back${rec.readings?.errors?.labels ? ` (A failed: ${rec.readings.errors.labels})` : ""} → ${guess}.`
  return `This run kept no readings → ${guess}.`
}

export function explainFacts(rec: SetupRecommendation, answers: Partial<FactAnswers>, current: FactAnswers | null): FactWhy[] {
  return FACT_IDS.map((id) => {
    const f = rec.facts.find((x) => x.id === id)
    const a = readingA(rec, id)
    const b = readingB(rec, id)
    const guess = f?.value ?? "—"
    return {
      id,
      question: FACT_QUESTION[id],
      used: current?.[id] ?? guess,
      engineGuess: guess,
      readingA: a,
      readingB: b,
      combined: combined(rec, id, a, b, guess),
      asked: f?.ask ? (ASK_REASON[f.askReason ?? ""] ?? f.askReason ?? "asked") : null,
      answer: answers[id] ?? null,
      evidence: f?.evidencePages ?? [],
    }
  })
}

const fact = (id: SetupBookFactId, current: FactAnswers, note?: string): Input => ({ label: id, value: current[id], from: "fact", note })

function inputsFor(rec: SetupRecommendation, id: SetupSettingId, current: FactAnswers): Input[] {
  const m = rec.measured
  const textLayer: Input = { label: "text layer", value: m.textLayer, from: "pdf", note: "real (selectable) words are needed to keep the page or place words beside pictures" }
  switch (id) {
    case "preset":
      return [fact("genre", current, "story → Storybook, textbook → School book, reference → Reference")]
    case "renderStrategy":
      return [fact("genre", current, "School book → AI layout, Reference → one column"), fact("composition", current, "for storybooks: on the picture → keep the page, beside → side by side, mostly text → reflow"), textLayer]
    case "pageGrouping":
      return [
        { label: "page storage", value: m.pageStorage, from: "pdf", note: `joined spreads ${m.joinedPairs}, facing pairs ${m.facingPairs}` },
      ]
    case "activitiesGenerator":
      return [
        fact("genre", current, "only School book keeps activity sections"),
        fact("exercises", current, "many → on; some → on only if the PDF shows exercise cues (or they can't be measured)"),
        { label: "exercise cues", value: m.exerciseCues === undefined ? "—" : m.exerciseCues ? "yes" : "no", from: "pdf", note: `${m.exerciseCuePages ?? "?"} pages with blanks, numbered tasks or instruction verbs (yes from 10% of pages); measured only with real text and a median of 100+ characters a page (median here: ${Math.round(m.medianChars)})` },
        textLayer,
      ]
    case "sectioningMode":
      return [fact("genre", current, "School book → split into sections by the AI; other presets → per page"), fact("exercises", current, "only changes which rule is named")]
    case "figureExtraction":
      return [fact("diagrams", current, "any but none → keep labelled pictures together"), { label: "drawn diagrams", value: m.vectorDiagrams === undefined ? "—" : m.vectorDiagrams ? "yes" : "no", from: "pdf", note: "vector drawings on 10%+ of pages also turn it on" }, textLayer]
  }
}

export function explainSettings(rec: SetupRecommendation, current: FactAnswers, effective: Record<string, { value: string | boolean } | undefined>, fromAnswers: Record<string, { value: string | boolean } | undefined>, source: (id: SetupSettingId) => Source, ruleWhy: (rule: string) => string): SettingWhy[] {
  const now = settingsFor(rec, current)
  return SETTING_IDS.map((id) => {
    const flips: Flip[] = []
    for (const f of FACT_IDS)
      for (const v of FACT_OPTIONS[f]) {
        if (v === current[f]) continue
        const then = settingsFor(rec, { ...current, [f]: v })
        if (then[id]?.value !== now[id]?.value) flips.push({ fact: f, value: v, result: wizardValue(id, then[id]?.value) })
      }
    const inputs = inputsFor(rec, id, current)
    const noFlip = inputs.some((i) => i.from === "fact") ? "no single answer changes it (it would take changing two or more, or a different PDF)" : "no answer changes it: it comes from the PDF's measurements"
    const rule = rec.settings[id]?.rule ?? "—"
    const afterRule = now[id]?.rule ?? rule
    return {
      id,
      name: WIZARD_NAME[id] ?? id,
      final: wizardValue(id, effective[id]?.value),
      engine: wizardValue(id, rec.settings[id]?.value),
      afterAnswers: wizardValue(id, fromAnswers[id]?.value),
      decidedBy: DECIDED_BY[source(id)],
      rule: afterRule,
      why: ruleWhy(afterRule),
      inputs,
      noFlip,
      flips,
      evidence: rec.settingEvidence[id] ?? [],
      locked: rec.lockedSettings.includes(id),
    }
  })
}
