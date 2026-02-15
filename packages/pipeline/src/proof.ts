import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage, PageData } from "@adt/storage"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import type { LlmLogEntry, LogLevel } from "@adt/llm"
import { captionPageImages, buildCaptionConfig, extractImageIds } from "./image-captioning.js"
import { generateGlossary, buildGlossaryConfig } from "./glossary.js"
import { generateAllQuizzes, buildQuizGenerationConfig, type QuizPageInput } from "./quiz-generation.js"
import { loadBookConfig } from "./config.js"
import { nullProgress, type Progress } from "./progress.js"
import { WebRenderingOutput, type StepName, type PageSectioningOutput } from "@adt/types"

export interface RunProofOptions {
  label: string
  booksRoot: string
  promptsDir: string
  configPath?: string
  /** Override cache directory. Defaults to {booksRoot}/{label}/.cache */
  cacheDir?: string
  /** LLM console log level. Defaults to "info". Use "silent" for no output. */
  logLevel?: LogLevel
}

/**
 * Runs the proof stage: image captioning, glossary generation, and quiz generation.
 * All three steps run in parallel. Requires storyboard to be accepted first.
 *
 * Caller is responsible for setting OPENAI_API_KEY in the environment.
 */
export async function runProof(
  options: RunProofOptions,
  progress: Progress = nullProgress
): Promise<void> {
  const { label, booksRoot, promptsDir, configPath, logLevel } = options

  const storage = createBookStorage(label, booksRoot)

  try {
    // Verify storyboard is accepted
    const acceptance = storage.getLatestNodeData(
      "storyboard-acceptance",
      "book"
    )
    if (!acceptance) {
      throw new Error(
        "Storyboard must be accepted before generating proof"
      )
    }

    // Load config
    const config = loadBookConfig(label, booksRoot, configPath)
    const cacheDir =
      options.cacheDir ?? path.join(path.resolve(booksRoot), label, ".cache")
    const promptEngine = createPromptEngine(promptsDir)
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as {
      language_code?: string | null
    } | null
    const language =
      config.editing_language ??
      metadata?.language_code ??
      "en"

    const onLlmLog = (entry: LlmLogEntry) => {
      storage.appendLlmLog(entry)
      const step = entry.taskType as StepName
      progress.emit({
        type: "llm-log",
        step,
        itemId: entry.pageId ?? "",
        promptName: entry.promptName,
        modelId: entry.modelId,
        cacheHit: entry.cacheHit,
        durationMs: entry.durationMs,
        inputTokens: entry.usage?.inputTokens,
        outputTokens: entry.usage?.outputTokens,
        validationErrors: entry.validationErrors,
      })
    }

    const pages = storage.getPages()
    const effectiveConcurrency = config.concurrency ?? 32

    // Build configs and models upfront
    const captionConfig = buildCaptionConfig(config)
    const captionModel = createLLMModel({
      modelId: captionConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      logLevel,
      onLog: onLlmLog,
    })

    const glossaryConfig = buildGlossaryConfig(config, language)
    const glossaryModel = createLLMModel({
      modelId: glossaryConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      logLevel,
      onLog: onLlmLog,
    })

    const quizConfig = buildQuizGenerationConfig(config, language)
    const quizModel = quizConfig
      ? createLLMModel({
          modelId: quizConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          logLevel,
          onLog: onLlmLog,
        })
      : null

    // Run all three steps in parallel
    const [captionResult, glossaryResult, quizResult] =
      await Promise.allSettled([
        runImageCaptioning(
          pages,
          storage,
          captionModel,
          captionConfig,
          language,
          effectiveConcurrency,
          progress
        ),
        runGlossary(
          pages,
          storage,
          glossaryModel,
          glossaryConfig,
          progress
        ),
        runQuizGeneration(
          pages,
          storage,
          quizModel,
          quizConfig,
          progress
        ),
      ])

    // Collect errors from all steps
    const errors: string[] = []
    if (captionResult.status === "rejected") {
      errors.push(toErrorMessage(captionResult.reason))
    }
    if (glossaryResult.status === "rejected") {
      errors.push(toErrorMessage(glossaryResult.reason))
    }
    if (quizResult.status === "rejected") {
      errors.push(toErrorMessage(quizResult.reason))
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"))
    }
  } finally {
    storage.close()
  }
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>()
  for (const item of items) {
    const p = fn(item).finally(() => {
      executing.delete(p)
    })
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)
}

async function runImageCaptioning(
  pages: PageData[],
  storage: Storage,
  llmModel: ReturnType<typeof createLLMModel>,
  captionConfig: ReturnType<typeof buildCaptionConfig>,
  language: string,
  concurrency: number,
  progress: Progress
): Promise<void> {
  const totalPages = pages.length
  let completedCaptions = 0
  const failedPages: string[] = []

  progress.emit({ type: "step-start", step: "image-captioning" })
  progress.emit({
    type: "step-progress",
    step: "image-captioning",
    message: `0/${totalPages}`,
    page: 0,
    totalPages,
  })

  await processWithConcurrency(
    pages,
    concurrency,
    async (page: PageData) => {
      try {
        await captionPage(
          page,
          storage,
          llmModel,
          captionConfig,
          language
        )
        completedCaptions++
        progress.emit({
          type: "step-progress",
          step: "image-captioning",
          message: `${completedCaptions}/${totalPages}`,
          page: completedCaptions,
          totalPages,
        })
      } catch (err) {
        const msg = toErrorMessage(err)
        failedPages.push(`${page.pageId}: ${msg}`)
        progress.emit({
          type: "step-error",
          step: "image-captioning",
          error: `${page.pageId} failed: ${msg}`,
        })
      }
    }
  )

  if (failedPages.length > 0) {
    throw new Error(
      `${failedPages.length} page(s) failed captioning:\n${failedPages.join("\n")}`
    )
  }

  progress.emit({ type: "step-complete", step: "image-captioning" })
}

async function runGlossary(
  pages: PageData[],
  storage: Storage,
  llmModel: ReturnType<typeof createLLMModel>,
  glossaryConfig: ReturnType<typeof buildGlossaryConfig>,
  progress: Progress
): Promise<void> {
  progress.emit({ type: "step-start", step: "glossary" })
  progress.emit({
    type: "step-progress",
    step: "glossary",
    message: "Generating glossary...",
  })

  try {
    const glossary = await generateGlossary({
      storage,
      pages,
      config: glossaryConfig,
      llmModel,
    })

    storage.putNodeData("glossary", "book", glossary)

    progress.emit({
      type: "step-progress",
      step: "glossary",
      message: `${glossary.items.length} terms from ${glossary.pageCount} pages`,
    })
    progress.emit({ type: "step-complete", step: "glossary" })
  } catch (err) {
    const msg = toErrorMessage(err)
    progress.emit({
      type: "step-error",
      step: "glossary",
      error: msg,
    })
    throw new Error(`Glossary generation failed: ${msg}`)
  }
}

async function runQuizGeneration(
  pages: PageData[],
  storage: Storage,
  llmModel: ReturnType<typeof createLLMModel> | null,
  quizConfig: ReturnType<typeof buildQuizGenerationConfig>,
  progress: Progress
): Promise<void> {
  progress.emit({ type: "step-start", step: "quiz-generation" })

  if (!quizConfig || !llmModel) {
    progress.emit({ type: "step-skip", step: "quiz-generation" })
    return
  }

  progress.emit({
    type: "step-progress",
    step: "quiz-generation",
    message: "Generating quizzes...",
  })

  try {
    // Gather page data for quiz generation
    const quizPages: QuizPageInput[] = []
    for (const page of pages) {
      const renderingRow = storage.getLatestNodeData(
        "web-rendering",
        page.pageId
      )
      const sectioningRow = storage.getLatestNodeData(
        "page-sectioning",
        page.pageId
      )
      if (!renderingRow || !sectioningRow) continue

      quizPages.push({
        pageId: page.pageId,
        rendering: renderingRow.data as WebRenderingOutput,
        sectioning: sectioningRow.data as PageSectioningOutput,
      })
    }

    if (quizPages.length > 0) {
      const quizResult = await generateAllQuizzes(
        quizPages,
        quizConfig,
        llmModel
      )
      storage.putNodeData("quiz-generation", "book", quizResult)

      progress.emit({
        type: "step-progress",
        step: "quiz-generation",
        message: `${quizResult.quizzes.length} quizzes from ${quizPages.length} pages`,
      })
    }

    progress.emit({ type: "step-complete", step: "quiz-generation" })
  } catch (err) {
    const msg = toErrorMessage(err)
    progress.emit({
      type: "step-error",
      step: "quiz-generation",
      error: msg,
    })
    throw new Error(`Quiz generation failed: ${msg}`)
  }
}

async function captionPage(
  page: PageData,
  storage: Storage,
  llmModel: ReturnType<typeof createLLMModel>,
  captionConfig: ReturnType<typeof buildCaptionConfig>,
  language: string
): Promise<void> {
  // Get rendered HTML for this page
  const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
  if (!renderingRow) {
    throw new Error(`Missing web-rendering output for page: ${page.pageId}`)
  }

  const parsedRendering = WebRenderingOutput.safeParse(renderingRow.data)
  if (!parsedRendering.success) {
    throw new Error(
      `Invalid web-rendering output for page: ${page.pageId}: ${parsedRendering.error.message}`
    )
  }
  const rendering = parsedRendering.data
  const htmlSections = rendering.sections.map((s) => s.html)

  // Extract image IDs from rendered HTML
  const imageIds = extractImageIds(htmlSections)
  if (imageIds.length === 0) {
    // No images in rendered HTML — store empty result
    storage.putNodeData("image-captioning", page.pageId, { captions: [] })
    return
  }

  // Load image base64 data
  const images = imageIds.map((imageId) => ({
    imageId,
    imageBase64: storage.getImageBase64(imageId),
  }))

  const pageImageBase64 = storage.getPageImageBase64(page.pageId)

  const result = await captionPageImages(
    {
      pageId: page.pageId,
      pageImageBase64,
      images,
      language,
    },
    captionConfig,
    llmModel
  )

  storage.putNodeData("image-captioning", page.pageId, result)
}
