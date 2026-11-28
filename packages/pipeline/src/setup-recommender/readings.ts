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
 * Pure: the model and the page renderer come in as parameters.
 */
import { z } from "zod"
import type { LLMModel, ContentPart, TokenUsage } from "@adt/llm"
import type { BookProfile } from "@adt/pdf"
import type { MeasuredFacts } from "./facts.js"
import { BOOK_FACT_IDS, BOOK_FACT_OPTIONS, type BookFactId, type BookFacts } from "./rules.js"

/** Renders 1-indexed pages at about `size` px; may be async (the server hands the event loop back between pages). */
export type RenderPages = (pages: number[], size: number) => Map<number, Uint8Array> | Promise<Map<number, Uint8Array>>

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
// One definition of where the words sit, shared by both readings (and by the
// question the user answers in Studio), so the two readings can't drift apart
// on a picture that runs across the fold.
// ---------------------------------------------------------------------------

export const WORDS_ON_PICTURE =
  "The words sit inside the picture's area, even on a calm part of it such as sky, sea or a coloured band of the illustration, and the picture may continue onto the facing page."
export const WORDS_BESIDE_PICTURE =
  "The words sit in their own area outside the picture: above, below or next to it, or on the facing page."
export const WORDS_MOSTLY = "It is mostly words. Pictures are few or small."

// ---------------------------------------------------------------------------
// Reading 1: plain questions
// ---------------------------------------------------------------------------

export const PLAIN_QUESTIONS: Record<BookFactId, { ask: string; options: Record<string, string> }> = {
  genre: {
    ask: "What is this book mostly?",
    options: {
      story:
        "A story. Readers follow characters or events from start to end: a picture book, a tale or a novel. A story with a few colouring or drawing pages is still a story.",
      textbook: "A schoolbook. It teaches a subject in lessons and gives the learner tasks to do.",
      reference:
        "Something people read to find information: a report, an article, a manual or a guide. It has no tasks for the reader.",
    },
  },
  exercises: {
    ask: "Does the book ask the reader to write or mark answers? (Colouring and drawing do not count.)",
    options: {
      none: "No. The reader only reads, or colours and draws. Questions inside the story that nobody writes an answer to do not count.",
      some: "Yes, on a few pages: questions to answer, blanks to fill, things to match, circle or tick.",
      many: "Yes, on most pages.",
    },
  },
  composition: {
    ask: "Where are the words on a page?",
    options: {
      "text-in-art": `On the picture. ${WORDS_ON_PICTURE}`,
      "text-beside-art": `Beside the picture. ${WORDS_BESIDE_PICTURE}`,
      "text-mostly": WORDS_MOSTLY,
    },
  },
  diagrams: {
    ask: "Are there pictures with labels that explain something, like maps, charts, diagrams or labelled drawings?",
    options: {
      none: "No. Only illustrations or photos. A caption under a photo does not count.",
      some: "Yes, a few.",
      many: "Yes, on many pages.",
    },
  },
}

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
    answer: z.enum(BOOK_FACT_OPTIONS[fact] as [string, ...string[]]),
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

function questionsContext(b: BookProfile, f: MeasuredFacts, pages: number[]): string {
  const lines = [
    `The book has ${b.pageCount} pages. You are shown pages ${pages.join(", ")}.`,
    `Measured from the PDF: median ${f.textDensity.medianChars} visible characters per page; pictures cover a median ${Math.round(f.pictureHeavy.medianCoverage * 100)}% of a page; text sits over a large picture on ${Math.round(f.textOverPictures.share * 100)}% of text pages; ${f.exerciseCues.pagesWithCues} pages show exercise cues (numbered items, blanks, instructions).`,
  ]
  for (const p of pages) {
    const page = b.pages.find((x) => x.page === p)
    if (page) lines.push(`Text of page ${p} (first 600 characters): ${page.text.slice(0, 600)}`)
  }
  return lines.join("\n")
}

export async function readQuestions(opts: {
  model: LLMModel
  profile: BookProfile
  facts: MeasuredFacts
  renderPages: RenderPages
  signal?: AbortSignal
}): Promise<QuestionsReading> {
  const started = performance.now()
  const pages = questionPages(opts.profile, opts.facts)
  const images = await opts.renderPages(pages, 1000)
  const questions = BOOK_FACT_IDS.map(
    (id) =>
      `${id}: ${PLAIN_QUESTIONS[id].ask}\n${Object.entries(PLAIN_QUESTIONS[id].options)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")}`,
  ).join("\n\n")
  const content: ContentPart[] = [
    {
      type: "text",
      text: `${questionsContext(opts.profile, opts.facts, pages)}\n\nAnswer every question below.\n\n${questions}`,
    },
  ]
  let uploadBytes = content[0].type === "text" ? content[0].text.length : 0
  for (const p of pages) {
    const img = images.get(p)
    if (!img) continue
    content.push({ type: "text", text: `Page ${p}:` }, { type: "image", image: toBase64(img) })
    uploadBytes += Math.ceil((img.length * 4) / 3)
  }
  const res = await opts.model.generateObject<z.infer<typeof QuestionsSchema>>({
    schema: QuestionsSchema,
    system:
      "You describe a book from a few of its pages so that a teacher can check your description against the paper book. Answer each question on its own. Base every answer on what you see; cite only the shown pages that support it. Use low confidence when the shown pages do not settle a question.",
    messages: [{ role: "user", content }],
    maxRetries: 1,
    signal: opts.signal,
    log: { taskType: "setup-recommender", promptName: "setup-recommender-questions" },
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
    uploadBytes,
  }
}

/** A two-letter language code from the model's answer, or null ("none", or anything that isn't a code). */
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

export const PAGE_TYPES = {
  cover: "Front or back cover.",
  "front-matter":
    "Title page, copyright, contents, or a preface, foreword or introduction written about the book by its author, editor or publisher.",
  story: "Narrative: tells a story (fiction or tale), as prose or as text with illustrations.",
  lesson: "Teaches a topic to learners: explanations, examples, worked content addressed to students.",
  exercise: "Tasks for the reader to do: questions to answer, blanks, matching, circling, writing.",
  informational: "Factual or academic prose read for information, not a lesson: article, paper, report, manual.",
  "back-matter": "Credits, licence, index, glossary, about the author, list of other titles.",
  blank: "Empty or nearly empty page, or a picture with no text that does not carry a story.",
} as const
export const PLACEMENTS = {
  "on-art": `On the picture. ${WORDS_ON_PICTURE}`,
  "beside-art": `Beside the picture. ${WORDS_BESIDE_PICTURE}`,
  "text-only": "Mostly text; pictures small or absent.",
  "no-text": "No readable text.",
} as const
export type PageType = keyof typeof PAGE_TYPES
export type Placement = keyof typeof PLACEMENTS
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
      type: z.enum(Object.keys(PAGE_TYPES) as [PageType, ...PageType[]]),
      textPlacement: z.enum(Object.keys(PLACEMENTS) as [Placement, ...Placement[]]),
      meaningfulFigure: z.boolean(),
    }),
  ),
  bookGenre: z.enum(["story", "textbook", "reference"]),
})

const NON_VOTING: PageType[] = ["cover", "front-matter", "back-matter", "blank"]
const BODY: PageType[] = ["story", "lesson", "exercise", "informational"]

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
  const isBody = (l?: PageLabel) => !!l && BODY.includes(l.type)
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
  renderPages: RenderPages
  signal?: AbortSignal
}): Promise<PageLabelsReading> {
  const started = performance.now()
  const { profile } = opts
  const plan = samplePlan(profile.pageCount)
  const pages = plan.all
  const byPage = new Map(profile.pages.map((p) => [p.page, p]))
  const list = (o: Record<string, string>) =>
    Object.entries(o)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n")
  const shown = plan.full
    ? `The book has ${profile.pageCount} pages; every page is shown below`
    : `The book has ${profile.pageCount} pages. You are shown ${pages.length} of them: the first ${plan.opening.length}, ${plan.middle.length} spread through the middle, and the last ${plan.end.length}`
  const intro = [
    `${shown}, each as a small image with its first 300 characters of text.`,
    `Label each page shown.\n\nPage type:\n${list(PAGE_TYPES)}\n\nText placement:\n${list(PLACEMENTS)}\n\nmeaningfulFigure: true when the page has a diagram, chart, map, table, labelled figure or infographic whose labels carry meaning (not a plain photo or illustration).`,
    `Finally, bookGenre: what the whole book most likely is (story, textbook or reference), judging from everything shown, including what any preface says about the book.`,
  ].join("\n\n")
  // All page texts in one block, then
  // each image after its "Page n:" label.
  const texts = pages.map((n) => `Page ${n}: Text: ${byPage.get(n)?.text.slice(0, 300) || "(no text)"}`)
  const text = [intro, ...texts].join("\n\n")
  const images = await opts.renderPages(pages, 512)
  const content: ContentPart[] = [{ type: "text", text }]
  let uploadBytes = text.length
  for (const n of pages) {
    const img = images.get(n)
    if (!img) continue
    content.push({ type: "text", text: `Page ${n}:` }, { type: "image", image: toBase64(img) })
    uploadBytes += Math.ceil((img.length * 4) / 3)
  }
  const res = await opts.model.generateObject<z.infer<typeof PageLabelsSchema>>({
    schema: PageLabelsSchema,
    system:
      "You label the pages of a book one by one, judging each page on its own. Then you give one guess for the whole book.",
    messages: [{ role: "user", content }],
    maxRetries: 1,
    signal: opts.signal,
    log: { taskType: "setup-recommender", promptName: "setup-recommender-page-labels" },
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
    uploadBytes,
  }
}
