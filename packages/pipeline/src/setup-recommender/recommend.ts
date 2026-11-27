/**
 * Engine E3 (issue #333): measure the PDF, read it twice with AI in two
 * different ways, pick settings with a fixed rulebook, and ask the user only
 * about facts that would change a setting AND where the readings disagree or
 * the labels saw too few pages of the book itself (policy P2 in the
 * experiments: 0.72 questions per book, no silent errors on the 54 run pairs).
 */
import type { LLMModel } from "@adt/llm"
import type { BookProfile } from "@adt/pdf"
import type { SetupDecided, SetupFact, SetupReadings, SetupRecommendation } from "@adt/types"
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

export function factEvidence(
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
        return value === "none" ? [] : [...labels.filter((l) => l.meaningfulFigure).map((l) => l.page), ...(measured.vectorDiagrams.value ? measured.vectorDiagrams.evidence : [])]
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
      // Composition only explains a story's strategy; for other presets the kind of book decides it.
      return facts.find((x) => x.id === "genre")?.value === "story" ? firstN([...of("composition"), ...of("genre")]) : of("genre")
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

/**
 * The labels' facts, except that a tie in the labels' count (as many pages
 * with words on the picture as beside it) takes the questions reading's
 * answer when it is one of the tied answers. Otherwise the tie stays with the
 * labels' pick and the readings disagree, so the fact is asked if it matters.
 */
export function breakTies(labels: Pick<PageLabelsReading, "facts" | "ties">, questions: Pick<QuestionsReading, "facts"> | null): BookFacts {
  const facts = { ...labels.facts }
  if (!questions) return facts
  for (const id of BOOK_FACT_IDS) {
    const tied = labels.ties[id]
    if (tied && tied.includes(questions.facts[id])) (facts as Record<BookFactId, string>)[id] = questions.facts[id]
  }
  return facts
}

/**
 * The book's language: what the questions reading saw on the pages (works on scans too), else the
 * stop-word guess from the PDF's text, else the PDF's own language tag (often left at a default).
 */
export function bookLanguage(fromAi: string | null, measured: { pdfTag: string | null; guess: string | null }): SetupRecommendation["language"] {
  const tag = measured.pdfTag ? (measured.pdfTag.toLowerCase().split(/[-_]/)[0] ?? null) : null
  if (fromAi) return { code: fromAi, source: "ai" }
  if (measured.guess) return { code: measured.guess, source: "text" }
  if (tag && /^[a-z]{2}$/.test(tag)) return { code: tag, source: "pdf-tag" }
  return { code: null, source: null }
}

/** The parsed answers of both readings, and why one failed, kept with the recommendation (maximum transparency). */
function readingsRecord(labels: PageLabelsReading | null, questions: QuestionsReading | null, errors: SetupReadings["errors"]): SetupReadings {
  return {
    ...(errors ? { errors } : {}),
    labels: labels
      ? {
          pages: labels.labels.map((l) => ({ page: l.page, type: l.type, textPlacement: l.textPlacement, meaningfulFigure: l.meaningfulFigure })),
          bookGenre: labels.bookGenre,
          facts: labels.facts,
          flags: labels.flags,
          ties: labels.ties,
          counts: labels.counts,
        }
      : null,
    questions: questions
      ? {
          pages: questions.pages,
          answers: Object.fromEntries(
            BOOK_FACT_IDS.map((id) => {
              const a = questions.answers[id]
              return [id, { answer: a.answer, confidence: a.confidence, evidencePages: a.evidencePages, reason: a.reason }]
            }),
          ) as NonNullable<SetupReadings["questions"]>["answers"],
          language: questions.language,
        }
      : null,
  }
}

export interface FactQuestion {
  id: BookFactId
  value: string
  matters: boolean
  affectsLocked: boolean
  askReason: "readings-disagree" | "few-body-pages" | "one-reading" | null
}

/**
 * Which facts to put to the user (pure, so the saved runs can replay it).
 * A fact matters when another answer would change a setting, under the
 * proposal or under the second reading (a fact can matter only under the
 * other reading's kind of book). It is asked when the readings disagree AND
 * the second opinion leads to different settings (under either reading), or
 * when the labels saw too few pages of the book itself, or when only one reading came back (the
 * other failed), so nothing checked it: then every fact that matters is asked.
 */
export function factQuestions(
  measured: MeasuredFacts,
  proposal: BookFacts,
  second: BookFacts | null,
  fewBodyPages: boolean,
  oneReading = false,
): FactQuestion[] {
  const bases = second ? [proposal, second] : [proposal]
  return BOOK_FACT_IDS.map((id) => {
    const value = proposal[id]
    const matters = bases.some((b) => factMatters(measured, b, id))
    const affectsLocked = bases.some((b) =>
      (BOOK_FACT_OPTIONS[id] as string[]).some((o) => settingsChangedBy(measured, b, id, o).some((s) => LOCKED_SETTINGS.includes(s))),
    )
    const other = second ? second[id] : null
    const disagree =
      second !== null &&
      other !== value &&
      (settingsChangedBy(measured, proposal, id, other!).length > 0 || settingsChangedBy(measured, second, id, value).length > 0)
    const askReason = !matters
      ? null
      : disagree
        ? ("readings-disagree" as const)
        : fewBodyPages
          ? ("few-body-pages" as const)
          : oneReading
            ? ("one-reading" as const)
            : null
    return { id, value, matters, affectsLocked, askReason }
  })
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
  const why = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : undefined)
  const errors = labels && questions ? undefined : { labels: why(labelsResult), questions: why(questionsResult) }
  if (!labels && !questions) {
    throw labelsResult.status === "rejected" ? labelsResult.reason : new Error("Both readings failed")
  }

  // The page labels are the proposal; the questions are the second opinion.
  const proposal: BookFacts = labels ? breakTies(labels, questions) : questions!.facts
  const fewBodyPages = labels ? labels.counts.body < 2 : false
  const pageLabels = labels?.labels ?? []

  const asks = factQuestions(measured, proposal, labels && questions ? questions.facts : null, fewBodyPages, !(labels && questions))
  const facts: SetupFact[] = asks.map((a) => ({
    id: a.id,
    value: a.value,
    secondOpinion: questions ? questions.facts[a.id] : null,
    reason: questions?.answers[a.id].reason ?? null,
    evidencePages: factEvidence(a.id, a.value, pageLabels, questions, measured),
    matters: a.matters,
    affectsLocked: a.affectsLocked,
    ask: a.askReason !== null,
    askReason: a.askReason,
  }))

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
      exerciseCuePages: measured.exerciseCues.pagesWithCues,
      exerciseCues: measured.exerciseCues.value,
      vectorDiagrams: measured.vectorDiagrams.value,
      textOverPicturesShare: measured.textOverPictures.share,
      medianChars: measured.textDensity.medianChars,
      language: measured.language.pdfTag ?? measured.language.guess,
    },
    language: bookLanguage(questions?.language ?? null, measured.language),
    facts,
    settings: toWire(decided),
    settingsByFacts: allCombinations(measured),
    settingEvidence: Object.fromEntries(SETTING_IDS.map((id) => [id, settingEvidence(id, facts, measured)])) as SetupRecommendation["settingEvidence"],
    lockedSettings: LOCKED_SETTINGS,
    pageRange: labels?.range ?? null,
    pageLabels: pageLabels.map((l) => ({ page: l.page, type: l.type })),
    readings: readingsRecord(labels, questions, errors),
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
