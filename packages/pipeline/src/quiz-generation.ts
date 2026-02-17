import { z } from "zod"
import { parseDocument, DomUtils } from "htmlparser2"
import type {
  AppConfig,
  WebRenderingOutput,
  PageSectioningOutput,
  QuizGenerationOutput,
  Quiz,
} from "@adt/types"
import { quizLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { processWithConcurrency } from "./concurrency.js"
import { buildLanguageContext, normalizeLocale } from "./language-context.js"

export interface QuizConfig {
  language: string
  pagesPerQuiz: number
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
    promptName: appConfig.quiz_generation?.prompt ?? "quiz_generation",
    modelId:
      appConfig.quiz_generation?.model ??
      appConfig.text_classification?.model ??
      "openai:gpt-5.2",
    maxRetries: appConfig.quiz_generation?.max_retries ?? 2,
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
 */
export function isContentPage(sectioning: PageSectioningOutput): boolean {
  return sectioning.sections.some((s) => !s.isPruned)
}

/**
 * Batch content pages into groups of N for quiz generation.
 * Non-content pages (all sections pruned) are skipped.
 */
export function batchPages(
  pages: QuizPageInput[],
  pagesPerQuiz: number
): QuizPageInput[][] {
  const contentPages = pages.filter((p) => isContentPage(p.sectioning))
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

  return {
    quizIndex,
    afterPageId: batch[batch.length - 1].pageId,
    pageIds: batch.map((p) => p.pageId),
    question: result.object.question,
    options: result.object.options,
    answerIndex: result.object.answer_index,
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
  const batches = batchPages(pages, config.pagesPerQuiz)
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

  return {
    generatedAt: new Date().toISOString(),
    language: config.language,
    pagesPerQuiz: config.pagesPerQuiz,
    quizzes,
  }
}
