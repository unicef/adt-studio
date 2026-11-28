/**
 * The two AI readings of the setup recommender (issue #333). They look at the
 * book in two different ways so that their disagreements point at the facts
 * worth asking the user about (in testing, a model's own confidence missed its
 * wrong facts, while two readings disagreeing caught them).
 *
 *  - Questions reading: 6 page images, four plain
 *    questions a teacher could answer from the paper book. Short books: pages
 *    chosen from the measured facts. Long books: pages from the middle.
 *  - Page-label reading: every page of short books, or a
 *    fixed sample of long ones (opening, middle, end), each labelled on its
 *    own. Book facts are counted from the labels with fixed thresholds; the
 *    labels also give the pages to import.
 *
 * The prompts are prompts/setup_recommender_questions.liquid and
 * prompts/setup_recommender_page_labels.liquid, rendered by the model's prompt engine.
 *
 * Pure: the model (with its prompt engine) and the rendered page images come in as parameters.
 */
import { z } from "zod"
import type { LLMModel, TokenUsage } from "@adt/llm"
import type { BookProfile } from "@adt/pdf"
import { SETUP_PAGE_TYPES, SETUP_TEXT_PLACEMENTS, type SetupPageType, type SetupTextPlacement } from "@adt/types"
import type { MeasuredFacts } from "./facts.js"
import { BOOK_FACT_IDS, BOOK_FACT_OPTIONS, type BookFactId, type BookFacts } from "./rules.js"

/**
 * Renders sets of 1-indexed pages, each set at about its `size` px, in one pass over the PDF;
 * returns one map (page -> image bytes) per set, in order.
 */
export type RenderPages = (sets: { pages: number[]; size: number }[]) => Promise<Map<number, Uint8Array>[]>

export const QUESTIONS_PROMPT = "setup_recommender_questions"
export const PAGE_LABELS_PROMPT = "setup_recommender_page_labels"
/** The longest side, in px, of the page images each reading is shown. */
export const QUESTIONS_IMAGE_SIZE = 1000
export const PAGE_LABELS_IMAGE_SIZE = 512

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)

// ---------------------------------------------------------------------------
// Page sample
// ---------------------------------------------------------------------------

export interface SamplePlan {
  opening: number[]
  middle: number[]
  end: number[]
  all: number[]
  /** Every page was read. */
  full: boolean
}

/** Books of 30 pages or fewer are read in full; longer ones on a fixed sample. */
export function samplePlan(pageCount: number): SamplePlan {
  if (pageCount <= 30) return { opening: [], middle: range(1, pageCount), end: [], all: range(1, pageCount), full: true }
  const openN = Math.min(24, Math.max(10, Math.round(pageCount * 0.06)))
  const opening = range(1, openN)
  const end = range(pageCount - 3, pageCount)
  const lo = openN + 1
  const hi = pageCount - 4
  const middle = [...new Set(Array.from({ length: 10 }, (_, i) => Math.round(lo + ((i + 0.5) * (hi - lo)) / 10)))]
  return { opening, middle, end, all: [...opening, ...middle, ...end], full: false }
}

/** Short books: up to 6 pages picked from the measured facts. */
export function choosePages(b: BookProfile, f: MeasuredFacts): number[] {
  const all = b.pages.map((p) => p.page)
  const interior = all.length >= 7 ? all.slice(1, -1) : all
  const picks = new Set<number>()
  const add = (n?: number) => {
    if (n !== undefined && interior.includes(n) && picks.size < 6) picks.add(n)
  }
  add(interior[0])
  add(f.exerciseCues.evidence[0])
  add(f.textOverPictures.evidence[0])
  add(f.vectorDiagrams.evidence[0])
  add(interior[Math.floor(interior.length / 2)])
  add(interior.at(-1))
  for (const n of interior) add(n)
  return [...picks].sort((a, c) => a - c)
}

export function questionPages(b: BookProfile, f: MeasuredFacts): number[] {
  const plan = samplePlan(b.pageCount)
  if (plan.full) return choosePages(b, f)
  const m = plan.middle
  return [0, 2, 4, 5, 7, 9].map((i) => m[Math.min(i, m.length - 1)]).filter((p, i, a) => a.indexOf(p) === i)
}

// ---------------------------------------------------------------------------
// Reading 1: plain questions (the questions and their answers are in the prompt)
// ---------------------------------------------------------------------------

export interface QuestionAnswer {
  answer: string
  confidence: "low" | "medium" | "high"
  evidencePages: number[]
  reason: string
}
export interface QuestionsReading {
  pages: number[]
  answers: Record<BookFactId, QuestionAnswer>
  facts: BookFacts
  /** The language most of the book's words are in, as an ISO 639-1 code; null when the pages show no words. */
  language: string | null
  usage: TokenUsage
  ms: number
  uploadBytes: number
}

function answerSchema(fact: BookFactId) {
  return z.object({
    answer: z.enum(BOOK_FACT_OPTIONS[fact] as readonly [string, ...string[]]),
    confidence: z.enum(["low", "medium", "high"]),
    evidencePages: z.array(z.number().int()),
    reason: z.string().describe("One short sentence a teacher can check against the pages."),
  })
}
const QuestionsSchema = z.object({
  genre: answerSchema("genre"),
  exercises: answerSchema("exercises"),
  composition: answerSchema("composition"),
  diagrams: answerSchema("diagrams"),
  language: z
    .string()
    .describe(
      'The language most of the book\'s words are written in, as a BCP 47 tag: the two-letter ISO 639-1 language, plus the country when the pages show which variety it is (spelling, words, forms of address such as "vos" or "vosotros", currency, places, school-system terms). For example "pt-BR" or "pt-PT", "es-ES", "es-MX", "es-AR", "es-UY" or "es-419" (Latin America, no one country), "en-GB" or "en-US", "fr-FR" or "fr-CA". Only the language ("sq", "pt") when the pages don\'t tell the variety. "none" when the shown pages have no words.',
    ),
})

/** A page as the prompts show it: its number, the start of its text, and its image (base64, "" when it couldn't be drawn). */
interface PromptPage {
  number: number
  text: string
  image: string
}

function promptPages(b: BookProfile, pages: number[], images: Map<number, Uint8Array>, textChars: number): PromptPage[] {
  const byPage = new Map(b.pages.map((p) => [p.page, p]))
  return pages.map((n) => {
    const img = images.get(n)
    return { number: n, text: byPage.get(n)?.text.slice(0, textChars) ?? "", image: img ? toBase64(img) : "" }
  })
}

/** About what the prompt uploads: the page texts and the images as base64 (the prompt's fixed wording is left out). */
const uploadBytesOf = (pages: PromptPage[]) => pages.reduce((n, p) => n + p.text.length + p.image.length, 0)

export async function readQuestions(opts: {
  model: LLMModel
  profile: BookProfile
  facts: MeasuredFacts
  /** The page images at QUESTIONS_IMAGE_SIZE, for `questionPages(profile, facts)`. */
  images: Map<number, Uint8Array>
  signal?: AbortSignal
}): Promise<QuestionsReading> {
  const started = performance.now()
  const { profile, facts: f } = opts
  const pages = questionPages(profile, f)
  const shown = promptPages(profile, pages, opts.images, 600)
  const res = await opts.model.generateObject<z.infer<typeof QuestionsSchema>>({
    schema: QuestionsSchema,
    prompt: QUESTIONS_PROMPT,
    context: {
      page_count: profile.pageCount,
      shown_pages: pages,
      measured: {
        median_chars: f.textDensity.medianChars,
        picture_coverage_pct: Math.round(f.pictureHeavy.medianCoverage * 100),
        text_over_pictures_pct: Math.round(f.textOverPictures.share * 100),
        exercise_cue_pages: f.exerciseCues.pagesWithCues,
      },
      pages: shown,
    },
    maxRetries: 1,
    signal: opts.signal,
    log: { taskType: "setup-recommender", promptName: QUESTIONS_PROMPT },
  })
  const { language, ...rest } = res.object
  const answers = rest as Record<BookFactId, QuestionAnswer>
  for (const id of BOOK_FACT_IDS) answers[id].evidencePages = answers[id].evidencePages.filter((p) => pages.includes(p))
  const facts = Object.fromEntries(BOOK_FACT_IDS.map((id) => [id, answers[id].answer])) as unknown as BookFacts
  return {
    pages,
    answers,
    facts,
    language: languageCode(language),
    usage: res.usage ?? { inputTokens: 0, outputTokens: 0 },
    ms: performance.now() - started,
    uploadBytes: uploadBytesOf(shown),
  }
}

/**
 * The language as a tag the app uses: "pt", or "pt-BR" / "es-419" when a region came with it.
 * Anything else after the language (a script, a typo) is dropped; no two-letter language → null.
 */
export function languageCode(answer: string | undefined): string | null {
  const [lang = "", region = ""] = (answer ?? "").trim().split(/[-_]/)
  const base = lang.toLowerCase()
  if (!/^[a-z]{2}$/.test(base)) return null
  if (/^[a-zA-Z]{2}$/.test(region)) return `${base}-${region.toUpperCase()}`
  if (/^\d{3}$/.test(region)) return `${base}-${region}`
  return base
}

// ---------------------------------------------------------------------------
// Reading 2: page labels
// ---------------------------------------------------------------------------

// The page types and text placements a label can take (what each means is in the prompt).
export const PAGE_TYPES = SETUP_PAGE_TYPES
export const PLACEMENTS = SETUP_TEXT_PLACEMENTS
export type PageType = SetupPageType
export type Placement = SetupTextPlacement
export interface PageLabel {
  page: number
  type: PageType
  textPlacement: Placement
  meaningfulFigure: boolean
}

const PageLabelsSchema = z.object({
  pages: z.array(
    z.object({
      page: z.number().int(),
      type: z.enum(PAGE_TYPES),
      textPlacement: z.enum(PLACEMENTS),
      meaningfulFigure: z.boolean(),
    }),
  ),
  bookGenre: z.enum(BOOK_FACT_OPTIONS.genre),
})

const NON_VOTING: PageType[] = ["cover", "front-matter", "back-matter", "blank"]
/** Pages of the book itself (not its covers, front or back matter, or blanks). */
export const BODY_PAGE_TYPES: PageType[] = ["story", "lesson", "exercise", "informational"]

export interface LabelCounts {
  body: number
  story: number
  textbook: number
  reference: number
  exercisePages: number
  figurePages: number
  placement: Record<string, number>
}

/** Book facts counted from page labels with fixed thresholds. */
export function countLabels(labels: PageLabel[], bookGuess: BookFacts["genre"]) {
  const body = labels.filter((l) => !NON_VOTING.includes(l.type))
  const flags: BookFactId[] = []
  /** Answers tied for the top count, per fact (only when there was a tie). */
  const ties: Partial<Record<BookFactId, string[]>> = {}
  const argmax = (m: Record<string, number>) => {
    const e = Object.entries(m).sort((a, b) => b[1] - a[1])
    return {
      key: e[0][0],
      share: e[0][1] / Math.max(1, e.reduce((s, x) => s + x[1], 0)),
      tie: e.length > 1 && e[0][1] === e[1][1],
      tied: e.filter((x) => x[1] === e[0][1]).map((x) => x[0]),
    }
  }
  const genreCounts = {
    story: body.filter((l) => l.type === "story").length,
    textbook: body.filter((l) => l.type === "lesson" || l.type === "exercise").length,
    reference: body.filter((l) => l.type === "informational").length,
  }
  let genre: BookFacts["genre"]
  if (body.length < 2) {
    genre = bookGuess
    flags.push("genre")
  } else {
    const g = argmax(genreCounts)
    genre = g.tie ? bookGuess : (g.key as BookFacts["genre"])
    if (g.tie || g.share < 0.6) flags.push("genre")
  }
  const ex = body.filter((l) => l.type === "exercise").length
  const exercises: BookFacts["exercises"] = ex === 0 ? "none" : ex < body.length / 2 ? "some" : "many"
  const hasText = (l: PageLabel) => l.textPlacement !== "no-text"
  const withText = body.some(hasText) ? body.filter(hasText) : labels.filter((l) => l.type !== "cover" && hasText(l))
  const placeCounts: Record<string, number> = { "on-art": 0, "beside-art": 0, "text-only": 0 }
  for (const l of withText) placeCounts[l.textPlacement]++
  const pl = argmax(placeCounts)
  if (withText.length === 0 || pl.tie || pl.share < 0.6) flags.push("composition")
  const PLACEMENT_FACT = { "on-art": "text-in-art", "beside-art": "text-beside-art", "text-only": "text-mostly" } as const
  if (withText.length > 0 && pl.tie) ties.composition = pl.tied.map((k) => PLACEMENT_FACT[k as keyof typeof PLACEMENT_FACT])
  const composition = PLACEMENT_FACT[pl.key as keyof typeof PLACEMENT_FACT]
  const fig = body.filter((l) => l.meaningfulFigure).length
  const diagrams: BookFacts["diagrams"] = fig === 0 ? "none" : fig < body.length / 3 ? "some" : "many"
  const counts: LabelCounts = { body: body.length, ...genreCounts, exercisePages: ex, figurePages: fig, placement: placeCounts }
  return { facts: { genre, exercises, composition, diagrams } as BookFacts, flags, ties, counts }
}

export interface PageRangeSuggestion {
  keepCover: boolean
  start: number
  end: number
  skipped: { from: number; to: number; why: "opening" | "end" }[]
  /** The start is exact only if the page before it was labelled too. */
  startExact: boolean
  endExact: boolean
}

/**
 * Pages to import, from the labels. Start = first body page followed by
 * another body page. End = last body page. The cover is kept. Null when no two
 * body pages were seen in a row.
 */
export function suggestRange(labels: PageLabel[], pageCount: number): PageRangeSuggestion | null {
  const sorted = [...labels].sort((a, b) => a.page - b.page)
  const isBody = (l?: PageLabel) => !!l && BODY_PAGE_TYPES.includes(l.type)
  const startIdx = sorted.findIndex((l, i) => isBody(l) && isBody(sorted[i + 1]))
  if (startIdx < 0) return null
  let endIdx = sorted.length - 1
  while (endIdx > startIdx && !isBody(sorted[endIdx])) endIdx--
  const start = sorted[startIdx].page
  const last = sorted[endIdx].page
  const next = sorted[endIdx + 1]
  const tail = sorted.slice(endIdx + 1)
  const tailRunsToEnd =
    tail.length > 0 && tail.at(-1)!.page === pageCount && tail.every((l, i) => i === 0 || l.page === tail[i - 1].page + 1)
  const end = next && next.page === last + 1 ? last : tailRunsToEnd ? tail[0].page - 1 : pageCount
  const cover = sorted[0]?.page === 1 && sorted[0].type === "cover"
  const skipStart = cover ? [2, start - 1] : [1, start - 1]
  return {
    keepCover: cover,
    start,
    end,
    skipped: [
      ...(skipStart[1] >= skipStart[0] ? [{ from: skipStart[0], to: skipStart[1], why: "opening" as const }] : []),
      ...(end < pageCount ? [{ from: end + 1, to: pageCount, why: "end" as const }] : []),
    ],
    startExact: start === 1 || sorted.some((l) => l.page === start - 1),
    endExact: tail.length === 0 || next.page === last + 1,
  }
}

export interface PageLabelsReading {
  plan: SamplePlan
  labels: PageLabel[]
  bookGenre: BookFacts["genre"]
  facts: BookFacts
  /** Facts whose count was close (under 60% agreement, a tie, or too few pages). */
  flags: BookFactId[]
  /** Answers tied for the top count, per fact. The proposal takes the questions reading's answer on a tie. */
  ties: Partial<Record<BookFactId, string[]>>
  counts: LabelCounts
  range: PageRangeSuggestion | null
  usage: TokenUsage
  ms: number
  uploadBytes: number
}

export async function readPageLabels(opts: {
  model: LLMModel
  profile: BookProfile
  /** The page images at PAGE_LABELS_IMAGE_SIZE, for `samplePlan(profile.pageCount).all`. */
  images: Map<number, Uint8Array>
  signal?: AbortSignal
}): Promise<PageLabelsReading> {
  const started = performance.now()
  const { profile } = opts
  const plan = samplePlan(profile.pageCount)
  const pages = plan.all
  const shown = promptPages(profile, pages, opts.images, 300)
  const res = await opts.model.generateObject<z.infer<typeof PageLabelsSchema>>({
    schema: PageLabelsSchema,
    prompt: PAGE_LABELS_PROMPT,
    context: {
      page_count: profile.pageCount,
      every_page: plan.full,
      opening_count: plan.opening.length,
      middle_count: plan.middle.length,
      end_count: plan.end.length,
      pages: shown,
    },
    maxRetries: 1,
    signal: opts.signal,
    log: { taskType: "setup-recommender", promptName: PAGE_LABELS_PROMPT },
  })
  // One label per page (the first), only for pages that were sent: a repeated page would count twice.
  const seen = new Set<number>()
  const labels = res.object.pages.filter((l) => pages.includes(l.page) && !seen.has(l.page) && (seen.add(l.page), true))
  const counted = countLabels(labels, res.object.bookGenre)
  return {
    plan,
    labels,
    bookGenre: res.object.bookGenre,
    facts: counted.facts,
    flags: counted.flags,
    ties: counted.ties,
    counts: counted.counts,
    range: suggestRange(labels, profile.pageCount),
    usage: res.usage ?? { inputTokens: 0, outputTokens: 0 },
    ms: performance.now() - started,
    uploadBytes: uploadBytesOf(shown),
  }
}
