import { z } from "zod"
import { parseDocument, DomUtils } from "htmlparser2"
import type {
  AppConfig,
  WebRenderingOutput,
  PageSectioningOutput,
  QuizGenerationOutput,
  Quiz,
} from "@adt/types"
import { quizLLMSchema, DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import type { Storage } from "@adt/storage"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { processWithConcurrency } from "./concurrency.js"
import { buildLanguageContext, normalizeLocale } from "./language-context.js"
import { getSemanticSectioning } from "./render-sectioning.js"
import { resolveReadingOrder, readingOrderPageIds } from "./reading-order.js"

export interface QuizConfig {
  language: string
  pagesPerQuiz: number
  quizSectionTypes?: string[]
  promptName: string
  modelId: string
  maxRetries: number
  timeoutMs: number
}

export interface QuizPageInput {
  pageId: string
  rendering: WebRenderingOutput
  sectioning: PageSectioningOutput
}

function renumberOptionText(text: string, index: number): string {
  const stripped = text.replace(/^\s*\d+\)\s*/u, "").trim()
  const label = `${index + 1})`
  return stripped ? `${label} ${stripped}` : label
}

function shuffleQuizOptions(
  options: Array<{ text: string; explanation: string }>,
  answerIndex: number,
  rng: () => number = Math.random
): { options: Array<{ text: string; explanation: string }>; answerIndex: number } {
  const withCorrect = options.map((option, index) => ({
    option,
    isCorrect: index === answerIndex,
  }))
  const shuffled = withCorrect.slice()

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const newAnswerIndex = shuffled.findIndex((entry) => entry.isCorrect)
  const renumbered = shuffled.map((entry, index) => ({
    text: renumberOptionText(entry.option.text, index),
    explanation: entry.option.explanation,
  }))

  return { options: renumbered, answerIndex: newAnswerIndex }
}

/**
 * Build quiz generation config from AppConfig and detected language.
 * Returns null if no language is available.
 */
export function buildQuizGenerationConfig(
  appConfig: AppConfig,
  detectedLanguage: string | null
): QuizConfig | null {
  const language = appConfig.editing_language ?? detectedLanguage
  if (!language) return null

  return {
    language: normalizeLocale(language),
    pagesPerQuiz: appConfig.quiz_generation?.pages_per_quiz ?? 3,
    quizSectionTypes: appConfig.quiz_generation?.quiz_section_types,
    promptName: appConfig.quiz_generation?.prompt ?? "quiz_generation",
    modelId:
      appConfig.quiz_generation?.model ??
      appConfig.page_sectioning?.model ??
      appConfig.default_model ??
      "openai:gpt-5.4",
    maxRetries:
      appConfig.quiz_generation?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    timeoutMs: (appConfig.quiz_generation?.timeout ?? 90) * 1000,
  }
}

/**
 * Extract plain text from rendered HTML by stripping tags.
 * Uses htmlparser2 (already an @adt/pipeline dependency).
 */
export function extractTextFromHtml(html: string): string {
  const doc = parseDocument(html)
  return DomUtils.textContent(doc).trim()
}

/**
 * Determine if a page has at least one non-pruned section.
 * If quizSectionTypes is undefined, all non-pruned sections count.
 * If quizSectionTypes is provided (including empty), only sections
 * matching those types are considered.
 */
export function isContentPage(
  sectioning: PageSectioningOutput,
  quizSectionTypes?: string[]
): boolean {
  return sectioning.sections.some((s) => {
    if (s.isPruned) return false
    if (quizSectionTypes === undefined) return true
    return quizSectionTypes.includes(s.sectionType)
  })
}

export interface QuizPageGathering {
  /** Pages eligible for quiz generation, in reading order. */
  quizPages: QuizPageInput[]
  /** Every source page the book has — the denominator worth reporting. */
  bookPageCount: number
  /** Pages the reader actually meets: unpruned, with something rendered. */
  inReadingOrder: number
  /** In the reading order, but with no semantic sectioning tree to batch on. */
  missingSectioning: number
}

/**
 * Gather the pages a quiz run batches over, in READING order.
 *
 * Source-PDF order is the wrong list: quizzes are placed every N pages, so the
 * pages a quiz covers — and where it lands — have to follow the sequence the
 * reader meets. Batching `storage.getPages()` after a reorder groups pages that
 * are no longer adjacent and anchors each quiz to an arbitrary position.
 *
 * Lives here, shared by both quiz runners (`stage-runner`'s `runQuizzesStep` and
 * `pipeline-dag`'s `quiz-generation` executor), because it was previously
 * written out in both and in the test that was supposed to catch them drifting
 * apart — so nothing actually pinned the behaviour the duplication was guarding.
 *
 * Note the counters. A page in the reading order has rendered content by
 * construction, so "missing web-rendering" is not a thing that can happen here
 * and is not reported; what can happen is a page with a render tree but no
 * *semantic* one, which is the fixed-layout case the section-type filter needs.
 * `bookPageCount` is carried separately so callers can say "3 of 120 pages" —
 * `quizPages.length / inReadingOrder` would read "0 of 0" for a book whose
 * storyboard has never run, which is the one case the diagnostic exists for.
 */
export function gatherQuizPageInputs(storage: Storage): QuizPageGathering {
  const pageIds = readingOrderPageIds(resolveReadingOrder(storage, { includeQuizzes: false }))
  const quizPages: QuizPageInput[] = []
  let missingSectioning = 0

  for (const pageId of pageIds) {
    const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
    // Filter by the SEMANTIC sectioning (real types like `text_and_single_image`),
    // not the render sectioning — in fixed-layout the render tree is positioned
    // and its only section type is `fixed-layout-page`, which never matches
    // `quiz_section_types`, so no page would qualify and no quiz would generate.
    const sectioning = getSemanticSectioning(storage, pageId)
    if (!sectioning) {
      missingSectioning++
      continue
    }
    if (!renderingRow) continue
    quizPages.push({
      pageId,
      rendering: renderingRow.data as WebRenderingOutput,
      sectioning,
    })
  }

  return {
    quizPages,
    bookPageCount: storage.getPages().length,
    inReadingOrder: pageIds.length,
    missingSectioning,
  }
}

/**
 * Batch content pages into groups of N for quiz generation.
 * Non-content pages (all sections pruned) are skipped.
 * When quizSectionTypes is provided, only pages with matching section types count.
 */
export function batchPages(
  pages: QuizPageInput[],
  pagesPerQuiz: number,
  quizSectionTypes?: string[]
): QuizPageInput[][] {
  const contentPages = pages.filter((p) => isContentPage(p.sectioning, quizSectionTypes))
  const batches: QuizPageInput[][] = []
  for (let i = 0; i < contentPages.length; i += pagesPerQuiz) {
    batches.push(contentPages.slice(i, i + pagesPerQuiz))
  }
  return batches
}

/**
 * Generate a single quiz for a batch of pages.
 */
export async function generateQuiz(
  batch: QuizPageInput[],
  quizIndex: number,
  config: QuizConfig,
  llmModel: LLMModel
): Promise<Quiz> {
  const pageTexts = batch.map((page) => {
    const combinedHtml = page.rendering.sections.map((s) => s.html).join("\n")
    return {
      pageId: page.pageId,
      text: extractTextFromHtml(combinedHtml),
    }
  })

  const result = await llmModel.generateObject<{
    reasoning: string
    question: string
    options: Array<{ text: string; explanation: string }>
    answer_index: number
  }>({
    schema: quizLLMSchema,
    prompt: config.promptName,
    context: {
      ...buildLanguageContext(config.language),
      page_texts: pageTexts,
    },
    validate: (raw: unknown): ValidationResult => {
      const r = raw as {
        question: string
        options: Array<{ text: string; explanation: string }>
        answer_index: number
      }
      const errors: string[] = []
      if (r.question.length > 200) {
        errors.push("Question exceeds 200 characters")
      }
      if (r.options.length !== 3) {
        errors.push(`Must provide exactly 3 options, got ${r.options.length}`)
      }
      for (const opt of r.options) {
        if (opt.text.length > 80)
          errors.push(
            `Option text exceeds 80 characters: "${opt.text.slice(0, 30)}..."`
          )
        if (opt.explanation.length > 400)
          errors.push("Explanation exceeds 400 characters")
        if (!opt.text) errors.push("Option text is missing")
        if (!opt.explanation) errors.push("Option explanation is missing")
      }
      if (r.answer_index < 0 || r.answer_index >= r.options.length) {
        errors.push(
          `answer_index ${r.answer_index} is out of range [0, ${r.options.length - 1}]`
        )
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: config.maxRetries,
    timeoutMs: config.timeoutMs,
    log: {
      taskType: "quiz-generation",
      promptName: config.promptName,
    },
  })

  const shuffled = shuffleQuizOptions(
    result.object.options,
    result.object.answer_index
  )

  return {
    quizIndex,
    afterPageId: batch[batch.length - 1].pageId,
    pageIds: batch.map((p) => p.pageId),
    question: result.object.question,
    options: shuffled.options,
    answerIndex: shuffled.answerIndex,
    reasoning: result.object.reasoning,
  }
}

/**
 * Generate all quizzes for a book.
 * Pure function — all dependencies provided as parameters.
 */
export async function generateAllQuizzes(
  pages: QuizPageInput[],
  config: QuizConfig,
  llmModel: LLMModel,
  options?: {
    concurrency?: number
    onQuizComplete?: (completed: number, total: number) => void
  }
): Promise<QuizGenerationOutput> {
  const batches = batchPages(pages, config.pagesPerQuiz, config.quizSectionTypes)
  const quizzes: Quiz[] = []
  const concurrency = options?.concurrency ?? 1
  let completed = 0

  await processWithConcurrency(
    batches.map((batch, index) => ({ batch, index })),
    concurrency,
    async ({ batch, index }) => {
      const quiz = await generateQuiz(batch, index, config, llmModel)
      quizzes.push(quiz)
      completed++
      options?.onQuizComplete?.(completed, batches.length)
    }
  )

  // Sort by index since parallel execution may complete out of order
  quizzes.sort((a, b) => a.quizIndex - b.quizIndex)

  // Identity is allocated by saveQuizOutput at persistence, against the book's
  // complete history. A cached LLM result is still a new quiz on regeneration.
  return {
    generatedAt: new Date().toISOString(),
    language: config.language,
    pagesPerQuiz: config.pagesPerQuiz,
    quizzes,
  }
}
