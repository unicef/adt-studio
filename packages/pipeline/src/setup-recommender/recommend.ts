/**
 * Engine E3 (issue #333): measure the PDF, read it twice with AI in two
 * different ways, pick settings with a fixed rulebook, and ask the user only
 * about facts that would change a setting AND where the readings disagree or
 * the labels saw too few pages of the book itself (policy P2 in the
 * experiments: 0.72 questions per book, no silent errors on the 54 run pairs).
 */
import type { LLMModel } from "@adt/llm"
import type { BookProfile } from "@adt/pdf"
import type { SetupDecided, SetupFact, SetupRecommendation } from "@adt/types"
import { measureFacts, type MeasuredFacts } from "./facts.js"
import {
  readPageLabels,
  readQuestions,
  type PageLabel,
  type PageLabelsReading,
  type QuestionsReading,
  type RenderPages,
} from "./readings.js"
import {
  BOOK_FACT_IDS,
  BOOK_FACT_OPTIONS,
  LOCKED_SETTINGS,
  SETTING_IDS,
  decide,
  factMatters,
  settingsChangedBy,
  type BookFactId,
  type BookFacts,
  type Decided,
  type SettingId,
} from "./rules.js"

const MAX_EVIDENCE = 4
const uniqSorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b)
const firstN = (xs: number[], n = MAX_EVIDENCE) => uniqSorted(xs).slice(0, n)

const PLACEMENT_FOR: Record<BookFacts["composition"], PageLabel["textPlacement"]> = {
  "text-in-art": "on-art",
  "text-beside-art": "beside-art",
  "text-mostly": "text-only",
}

function factEvidence(
  fact: BookFactId,
  value: string,
  labels: PageLabel[],
  questions: QuestionsReading | null,
  measured: MeasuredFacts,
): number[] {
  const fromLabels = (() => {
    switch (fact) {
      case "genre":
        return labels
          .filter((l) =>
            value === "story" ? l.type === "story" : value === "textbook" ? l.type === "lesson" || l.type === "exercise" : l.type === "informational",
          )
          .map((l) => l.page)
      case "exercises":
        return value === "none" ? [] : [...labels.filter((l) => l.type === "exercise").map((l) => l.page), ...measured.exerciseCues.evidence]
      case "composition":
        return labels
          .filter((l) => l.textPlacement === PLACEMENT_FOR[value as BookFacts["composition"]] && l.type !== "cover")
          .map((l) => l.page)
      case "diagrams":
        return value === "none" ? [] : [...labels.filter((l) => l.meaningfulFigure).map((l) => l.page), ...measured.vectorDiagrams.evidence]
    }
  })()
  const fromQuestions = questions && questions.answers[fact].answer === value ? questions.answers[fact].evidencePages : []
  return firstN([...fromLabels, ...fromQuestions])
}

function settingEvidence(id: SettingId, facts: SetupFact[], measured: MeasuredFacts): number[] {
  const of = (f: BookFactId) => facts.find((x) => x.id === f)?.evidencePages ?? []
  switch (id) {
    case "preset":
      return of("genre")
    case "renderStrategy":
      return firstN([...of("composition"), ...of("genre")])
    case "pageGrouping":
      return measured.pageStorage.evidence
    case "sectioningMode":
    case "activitiesGenerator":
      return of("exercises")
    case "figureExtraction":
      return of("diagrams")
  }
}

const toWire = (d: Decided): SetupDecided =>
  Object.fromEntries(SETTING_IDS.map((id) => [id, { value: d[id].value, rule: d[id].rule }])) as SetupDecided

function allCombinations(measured: MeasuredFacts): Record<string, SetupDecided> {
  const out: Record<string, SetupDecided> = {}
  for (const genre of BOOK_FACT_OPTIONS.genre)
    for (const exercises of BOOK_FACT_OPTIONS.exercises)
      for (const composition of BOOK_FACT_OPTIONS.composition)
        for (const diagrams of BOOK_FACT_OPTIONS.diagrams)
          out[`${genre}|${exercises}|${composition}|${diagrams}`] = toWire(
            decide(measured, { genre, exercises, composition, diagrams }),
          )
  return out
}

export interface RecommendSetupOptions {
  id: string
  model: LLMModel
  modelId: string
  profile: BookProfile
  renderPages: RenderPages
  signal?: AbortSignal
}

export async function recommendSetup(opts: RecommendSetupOptions): Promise<SetupRecommendation> {
  const started = performance.now()
  const { profile } = opts
  const factsStarted = performance.now()
  const measured = measureFacts(profile)
  const factsMs = performance.now() - factsStarted

  const [labelsResult, questionsResult] = await Promise.allSettled([
    readPageLabels({ model: opts.model, profile, renderPages: opts.renderPages, signal: opts.signal }),
    readQuestions({ model: opts.model, profile, facts: measured, renderPages: opts.renderPages, signal: opts.signal }),
  ])
  const labels: PageLabelsReading | null = labelsResult.status === "fulfilled" ? labelsResult.value : null
  const questions: QuestionsReading | null = questionsResult.status === "fulfilled" ? questionsResult.value : null
  if (!labels && !questions) {
    throw labelsResult.status === "rejected" ? labelsResult.reason : new Error("Both readings failed")
  }

  // The page labels are the proposal; the questions are the second opinion.
  const proposal: BookFacts = labels?.facts ?? questions!.facts
  const fewBodyPages = labels ? labels.counts.body < 2 : false
  const pageLabels = labels?.labels ?? []

  const facts: SetupFact[] = BOOK_FACT_IDS.map((id) => {
    const value = proposal[id]
    const second = labels && questions ? questions.facts[id] : null
    const matters = factMatters(measured, proposal, id)
    const affectsLocked = (BOOK_FACT_OPTIONS[id] as string[]).some((o) =>
      settingsChangedBy(measured, proposal, id, o).some((s) => LOCKED_SETTINGS.includes(s)),
    )
    const disagree = second !== null && second !== value
    const askReason = !matters ? null : disagree ? ("readings-disagree" as const) : fewBodyPages ? ("few-body-pages" as const) : null
    return {
      id,
      value,
      secondOpinion: questions ? questions.facts[id] : null,
      reason: questions?.answers[id].reason ?? null,
      evidencePages: factEvidence(id, value, pageLabels, questions, measured),
      matters,
      affectsLocked,
      ask: askReason !== null,
      askReason,
    }
  })

  const decided = decide(measured, proposal)
  const bodyPage = pageLabels.find((l) => ["story", "lesson", "exercise", "informational"].includes(l.type))?.page
  const previewPage = bodyPage ?? questions?.pages[0] ?? 1

  return {
    id: opts.id,
    engine: "e3",
    model: opts.modelId,
    pageCount: profile.pageCount,
    previewPage,
    measured: {
      pageStorage: measured.pageStorage.value,
      pageStorageEvidence: measured.pageStorage.evidence,
      joinedPairs: measured.pageStorage.seams,
      facingPairs: measured.pageStorage.pairs,
      textLayer: measured.textLayer.value,
      textLayerEvidence: measured.textLayer.evidence,
      medianChars: measured.textDensity.medianChars,
      language: measured.language.pdfTag ?? measured.language.guess,
    },
    facts,
    settings: toWire(decided),
    settingsByFacts: allCombinations(measured),
    settingEvidence: Object.fromEntries(SETTING_IDS.map((id) => [id, settingEvidence(id, facts, measured)])) as SetupRecommendation["settingEvidence"],
    lockedSettings: LOCKED_SETTINGS,
    pageRange: labels?.range ?? null,
    pageLabels: pageLabels.map((l) => ({ page: l.page, type: l.type })),
    secondOpinion: labels !== null && questions !== null,
    timings: {
      profileMs: profile.ms,
      factsMs,
      questionsMs: questions?.ms ?? null,
      labelsMs: labels?.ms ?? null,
      totalMs: profile.ms + (performance.now() - started),
      uploadBytes: (labels?.uploadBytes ?? 0) + (questions?.uploadBytes ?? 0),
    },
    usage: {
      inputTokens: (labels?.usage.inputTokens ?? 0) + (questions?.usage.inputTokens ?? 0),
      outputTokens: (labels?.usage.outputTokens ?? 0) + (questions?.usage.outputTokens ?? 0),
      calls: (labels ? 1 : 0) + (questions ? 1 : 0),
      labels: labels ? labels.usage : null,
      questions: questions ? questions.usage : null,
    },
  }
}
