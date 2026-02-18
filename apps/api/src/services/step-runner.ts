import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import type { LlmLogEntry } from "@adt/llm"
import {
  extractPDF,
  extractMetadata,
  buildMetadataConfig,
  classifyPageText,
  buildClassifyConfig,
  classifyPageImages,
  buildImageClassifyConfig,
  translatePageText,
  buildTranslationConfig,
  getBaseLanguage,
  normalizeLocale,
  loadBookConfig,
  sectionPage,
  buildSectioningConfig,
  renderPage,
  buildRenderStrategyResolver,
  createTemplateEngine,
  // Proof step imports
  captionPageImages,
  buildCaptionConfig,
  extractImageIds,
  generateGlossary,
  buildGlossaryConfig,
  generateAllQuizzes,
  buildQuizGenerationConfig,
  // Master step imports
  buildTextCatalog,
  translateCatalogBatch,
  buildCatalogTranslationConfig,
  getTargetLanguages,
  loadVoicesConfig,
  loadSpeechInstructions,
  resolveVoice,
  resolveInstructions,
  generateSpeechFile,
} from "@adt/pipeline"
import type { TranslationConfig, QuizPageInput } from "@adt/pipeline"
import { loadStyleguideContent } from "./pipeline-runner"
import { createTTSSynthesizer } from "@adt/llm"
import type {
  TextClassificationOutput,
  ImageClassificationOutput,
  PageSectioningOutput,
  WebRenderingOutput,
  TextCatalogOutput,
  TextCatalogEntry,
  SpeechFileEntry,
  TTSOutput,
  StepName,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import type { PageData } from "@adt/storage"
import type {
  StepRunner,
  StepRunProgress,
  StepRunOptions,
} from "./step-service.js"

const DEFAULT_METADATA_PAGES = 3

class StepError extends Error {
  readonly step: StepName

  constructor(step: StepName, message: string) {
    super(message)
    this.name = "StepError"
    this.step = step
  }
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function wrapStepError(step: StepName, err: unknown): never {
  if (err instanceof StepError) throw err
  throw new StepError(step, toErrorMessage(err))
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

const STEP_ORDER = [
  "extract",
  "storyboard",
  "quizzes",
  "captions",
  "glossary",
  "translations",
  "text-to-speech",
] as const

type RunFn = (label: string, options: StepRunOptions, progress: StepRunProgress) => Promise<void>

const STEP_RUNNERS: Record<string, RunFn> = {
  "extract": runExtractStep,
  "storyboard": runStoryboardStep,
  "quizzes": runQuizzesStep,
  "captions": runCaptionsStep,
  "glossary": runGlossaryStep,
  "translations": runTranslationsStep,
  "text-to-speech": runTextToSpeechStep,
}

/**
 * Creates a step runner that executes pipeline steps.
 * Supports single steps (fromStep === toStep) and ranges (e.g. extract → storyboard).
 */
export function createStepRunner(): StepRunner {
  return {
    async run(
      label: string,
      options: StepRunOptions,
      progress: StepRunProgress
    ): Promise<void> {
      const { fromStep, toStep } = options
      console.log(`[step-run] ${label}: starting ${fromStep}→${toStep}`)

      const fromIndex = STEP_ORDER.indexOf(fromStep as typeof STEP_ORDER[number])
      const toIndex = STEP_ORDER.indexOf(toStep as typeof STEP_ORDER[number])

      if (fromIndex === -1 || toIndex === -1 || fromIndex > toIndex) {
        throw new Error(`Invalid step range "${fromStep}" to "${toStep}"`)
      }

      for (let i = fromIndex; i <= toIndex; i++) {
        const stepSlug = STEP_ORDER[i]
        await STEP_RUNNERS[stepSlug](label, options, progress)
      }

      console.log(`[step-run] ${label}: completed ${fromStep}→${toStep}`)
    },
  }
}

async function runExtractStep(
  label: string,
  options: StepRunOptions,
  progress: StepRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const pdfPath = path.join(path.resolve(booksDir), label, `${label}.pdf`)
    const config = loadBookConfig(label, booksDir, configPath)

    // Step 1: Extract PDF
    console.log(`[step-run] ${label}: extracting PDF from ${pdfPath}`)
    await extractPDF(
      {
        pdfPath,
        startPage: config.start_page,
        endPage: config.end_page,
        spreadMode: config.spread_mode,
      },
      storage,
      progress
    )
    console.log(`[step-run] ${label}: PDF extraction complete`)

    // Step 2: Extract Metadata
    const metadataConfig = buildMetadataConfig(config)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

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

    const metadataModel = createLLMModel({
      modelId: metadataConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
    })

    const pages = storage.getPages()
    const metadataPages = pages.slice(0, DEFAULT_METADATA_PAGES)
    const pageInputs = metadataPages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      imageBase64: storage.getPageImageBase64(page.pageId),
    }))

    console.log(`[step-run] ${label}: extracting metadata from ${metadataPages.length} pages`)
    progress.emit({ type: "step-start", step: "metadata" })
    const metadataResult = await extractMetadata(
      pageInputs,
      metadataConfig,
      metadataModel
    )
    storage.putNodeData("metadata", "book", metadataResult)
    progress.emit({ type: "step-complete", step: "metadata" })
    console.log(`[step-run] ${label}: metadata complete (lang=${metadataResult.language_code})`)

    // Determine if translation is needed
    const translationConfig = buildTranslationConfig(
      config,
      metadataResult.language_code
    )

    // Step 3: Per-page classification
    const textClassifyConfig = buildClassifyConfig(config)
    const imageClassifyConfig = buildImageClassifyConfig(config)

    const llmModel = createLLMModel({
      modelId: textClassifyConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
    })

    const translationModel = translationConfig
      ? createLLMModel({
          modelId: translationConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
        })
      : null

    const effectiveConcurrency = config.concurrency ?? 32
    const totalPages = pages.length
    console.log(`[step-run] ${label}: classifying ${totalPages} pages (concurrency=${effectiveConcurrency})`)
    let completedClassifyText = 0
    let completedClassifyImages = 0
    let completedTranslation = 0
    const failedPages: string[] = []

    await processWithConcurrency(
      pages,
      effectiveConcurrency,
      async (page: PageData) => {
        try {
          await classifyPage(
            page,
            storage,
            { textClassifyConfig, imageClassifyConfig },
            llmModel,
            {
              onClassifyImages: () => {
                completedClassifyImages++
                progress.emit({
                  type: "step-progress",
                  step: "image-classification",
                  message: `${completedClassifyImages}/${totalPages}`,
                  page: completedClassifyImages,
                  totalPages,
                })
              },
              onClassifyText: () => {
                completedClassifyText++
                progress.emit({
                  type: "step-progress",
                  step: "text-classification",
                  message: `${completedClassifyText}/${totalPages}`,
                  page: completedClassifyText,
                  totalPages,
                })
              },
              onTranslate: () => {
                completedTranslation++
                progress.emit({
                  type: "step-progress",
                  step: "translation",
                  message: `${completedTranslation}/${totalPages}`,
                  page: completedTranslation,
                  totalPages,
                })
              },
            },
            translationConfig,
            translationModel
          )
        } catch (err) {
          const msg = toErrorMessage(err)
          const step =
            err instanceof StepError ? err.step : "text-classification"
          console.error(`[step-run] ${label}: ${page.pageId} failed at ${step}: ${msg}`)
          failedPages.push(`${page.pageId} [${step}]: ${msg}`)
          progress.emit({
            type: "step-error",
            step,
            error: `${page.pageId} failed: ${msg}`,
          })
        }
      }
    )

    if (failedPages.length > 0) {
      throw new Error(
        `${failedPages.length} page(s) failed:\n${failedPages.join("\n")}`
      )
    }

    // Emit completion for classification steps
    progress.emit({ type: "step-complete", step: "image-classification" })
    progress.emit({ type: "step-complete", step: "text-classification" })
    if (translationConfig) {
      progress.emit({ type: "step-complete", step: "translation" })
    } else {
      progress.emit({ type: "step-skip", step: "translation" })
    }
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}

async function runStoryboardStep(
  label: string,
  options: StepRunOptions,
  progress: StepRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)

    const styleguideContent = loadStyleguideContent(config.styleguide, configPath)

    // Build configs
    const sectioningConfig = buildSectioningConfig(config)
    const resolveRenderConfig = buildRenderStrategyResolver(config)

    // Create prompt engine, rate limiter, LLM model
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

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

    const llmModel = createLLMModel({
      modelId: sectioningConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
    })

    // Create template engine
    const templatesDir = path.join(path.dirname(promptsDir), "templates")
    const templateEngine = createTemplateEngine(templatesDir)

    // Create render model resolver (cached factory)
    const renderModels = new Map<string, LLMModel>()
    const resolveRenderModel = (modelId: string): LLMModel => {
      const existing = renderModels.get(modelId)
      if (existing) return existing
      const model = createLLMModel({
        modelId,
        cacheDir,
        promptEngine,
        rateLimiter,
        onLog: onLlmLog,
      })
      renderModels.set(modelId, model)
      return model
    }

    // Get all pages
    const pages = storage.getPages()
    const totalPages = pages.length
    const effectiveConcurrency = config.concurrency ?? 32

    console.log(
      `[step-run] ${label}: running storyboard for ${totalPages} pages (concurrency=${effectiveConcurrency})`
    )

    let completedSectioning = 0
    let completedRendering = 0
    const failedPages: string[] = []

    await processWithConcurrency(
      pages,
      effectiveConcurrency,
      async (page: PageData) => {
        try {
          // Get text-classification data
          const textClassificationRow = storage.getLatestNodeData(
            "text-classification",
            page.pageId
          )
          if (!textClassificationRow) {
            console.log(
              `[step-run] ${label}: skipping ${page.pageId} (no text-classification)`
            )
            return
          }
          const textClassification = textClassificationRow.data as TextClassificationOutput

          // Get image-classification data
          const imageClassificationRow = storage.getLatestNodeData(
            "image-classification",
            page.pageId
          )
          const imageClassification = (imageClassificationRow?.data as ImageClassificationOutput) ?? { images: [] }

          // Get page image and page images
          const pageImageBase64 = storage.getPageImageBase64(page.pageId)
          const allImages = storage.getPageImages(page.pageId)

          // Filter pruned images
          const prunedImageIds = new Set(
            imageClassification.images
              .filter((img) => img.isPruned)
              .map((img) => img.imageId)
          )

          // Build section images (unpruned with base64)
          const sectionImages = allImages
            .filter((img) => !prunedImageIds.has(img.imageId))
            .map((img) => ({
              imageId: img.imageId,
              imageBase64: storage.getImageBase64(img.imageId),
            }))

          // Page sectioning
          console.log(
            `[step-run] ${label}: sectioning ${page.pageId}`
          )
          const sectionResult = await sectionPage(
            {
              pageId: page.pageId,
              pageNumber: page.pageNumber,
              pageImageBase64,
              textClassification,
              imageClassification,
              images: sectionImages,
            },
            sectioningConfig,
            llmModel
          )
          storage.putNodeData("page-sectioning", page.pageId, sectionResult)
          completedSectioning++
          progress.emit({
            type: "step-progress",
            step: "page-sectioning",
            message: `${completedSectioning}/${totalPages}`,
            page: completedSectioning,
            totalPages,
          })

          // Build render images map (same filtering)
          const renderImages = new Map<string, string>()
          for (const img of allImages) {
            if (!prunedImageIds.has(img.imageId)) {
              renderImages.set(img.imageId, storage.getImageBase64(img.imageId))
            }
          }

          // Web rendering
          console.log(
            `[step-run] ${label}: rendering ${page.pageId}`
          )
          const sectioning = sectionResult as PageSectioningOutput
          const renderResult = await renderPage(
            {
              label,
              pageId: page.pageId,
              pageImageBase64,
              sectioning,
              images: renderImages,
              styleguide: styleguideContent,
            },
            resolveRenderConfig,
            resolveRenderModel,
            templateEngine
          )
          storage.putNodeData("web-rendering", page.pageId, renderResult)
          completedRendering++
          progress.emit({
            type: "step-progress",
            step: "web-rendering",
            message: `${completedRendering}/${totalPages}`,
            page: completedRendering,
            totalPages,
          })
        } catch (err) {
          const msg = toErrorMessage(err)
          const step =
            err instanceof StepError ? err.step : "page-sectioning"
          console.error(
            `[step-run] ${label}: ${page.pageId} failed at ${step}: ${msg}`
          )
          failedPages.push(`${page.pageId} [${step}]: ${msg}`)
          progress.emit({
            type: "step-error",
            step,
            error: `${page.pageId} failed: ${msg}`,
          })
        }
      }
    )

    if (failedPages.length > 0) {
      throw new Error(
        `${failedPages.length} page(s) failed:\n${failedPages.join("\n")}`
      )
    }

    // Emit completion for storyboard steps
    progress.emit({ type: "step-complete", step: "page-sectioning" })
    progress.emit({ type: "step-complete", step: "web-rendering" })
    console.log(`[step-run] ${label}: storyboard complete`)
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}

// ---------------------------------------------------------------------------
// Quizzes step
// ---------------------------------------------------------------------------

async function runQuizzesStep(
  label: string,
  options: StepRunOptions,
  progress: StepRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    const quizConfig = buildQuizGenerationConfig(config, language)
    if (!quizConfig) {
      progress.emit({ type: "step-skip", step: "quiz-generation" })
      console.log(`[step-run] ${label}: quizzes skipped (disabled in config)`)
      return
    }

    const quizModel = createLLMModel({
      modelId: quizConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
    })

    const effectiveConcurrency = config.concurrency ?? 32

    progress.emit({ type: "step-start", step: "quiz-generation" })

    // Gather page data for quiz generation
    const pages = storage.getPages()
    const quizPages: QuizPageInput[] = []
    for (const page of pages) {
      const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
      const sectioningRow = storage.getLatestNodeData("page-sectioning", page.pageId)
      if (!renderingRow || !sectioningRow) continue
      quizPages.push({
        pageId: page.pageId,
        rendering: renderingRow.data as WebRenderingOutput,
        sectioning: sectioningRow.data as PageSectioningOutput,
      })
    }

    if (quizPages.length > 0) {
      const quizResult = await generateAllQuizzes(quizPages, quizConfig, quizModel, {
        concurrency: effectiveConcurrency,
        onQuizComplete: (completed, total) => {
          progress.emit({
            type: "step-progress",
            step: "quiz-generation",
            message: `${completed}/${total}`,
            page: completed,
            totalPages: total,
          })
        },
      })
      storage.putNodeData("quiz-generation", "book", quizResult)
      progress.emit({
        type: "step-progress",
        step: "quiz-generation",
        message: `${quizResult.quizzes.length} quizzes from ${quizPages.length} pages`,
      })
    }

    progress.emit({ type: "step-complete", step: "quiz-generation" })
    console.log(`[step-run] ${label}: quizzes complete`)
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}

// ---------------------------------------------------------------------------
// Captions step
// ---------------------------------------------------------------------------

async function runCaptionsStep(
  label: string,
  options: StepRunOptions,
  progress: StepRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    const captionConfig = buildCaptionConfig(config)
    const captionModel = createLLMModel({
      modelId: captionConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
    })

    const pages = storage.getPages()
    const totalPages = pages.length
    const effectiveConcurrency = config.concurrency ?? 32
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

    console.log(`[step-run] ${label}: captioning ${totalPages} pages (concurrency=${effectiveConcurrency})`)

    await processWithConcurrency(
      pages,
      effectiveConcurrency,
      async (page: PageData) => {
        try {
          // Get rendered HTML for this page
          const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
          if (!renderingRow) {
            // No rendering — store empty result
            storage.putNodeData("image-captioning", page.pageId, { captions: [] })
            completedCaptions++
            progress.emit({
              type: "step-progress",
              step: "image-captioning",
              message: `${completedCaptions}/${totalPages}`,
              page: completedCaptions,
              totalPages,
            })
            return
          }

          const rendering = renderingRow.data as WebRenderingOutput
          const htmlSections = rendering.sections.map((s) => s.html)
          const imageIds = extractImageIds(htmlSections)

          if (imageIds.length === 0) {
            storage.putNodeData("image-captioning", page.pageId, { captions: [] })
            completedCaptions++
            progress.emit({
              type: "step-progress",
              step: "image-captioning",
              message: `${completedCaptions}/${totalPages}`,
              page: completedCaptions,
              totalPages,
            })
            return
          }

          const images = imageIds.map((imageId) => ({
            imageId,
            imageBase64: storage.getImageBase64(imageId),
          }))
          const pageImageBase64 = storage.getPageImageBase64(page.pageId)

          const result = await captionPageImages(
            { pageId: page.pageId, pageImageBase64, images, language },
            captionConfig,
            captionModel
          )
          storage.putNodeData("image-captioning", page.pageId, result)

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
    console.log(`[step-run] ${label}: captions complete`)
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}

// ---------------------------------------------------------------------------
// Glossary step
// ---------------------------------------------------------------------------

async function runGlossaryStep(
  label: string,
  options: StepRunOptions,
  progress: StepRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    const glossaryConfig = buildGlossaryConfig(config, language)
    const glossaryModel = createLLMModel({
      modelId: glossaryConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
    })

    const pages = storage.getPages()
    const effectiveConcurrency = config.concurrency ?? 32

    progress.emit({ type: "step-start", step: "glossary" })

    console.log(`[step-run] ${label}: generating glossary from ${pages.length} pages`)

    const glossary = await generateGlossary({
      storage,
      pages,
      config: glossaryConfig,
      llmModel: glossaryModel,
      concurrency: effectiveConcurrency,
      onBatchComplete: (completed, total) => {
        progress.emit({
          type: "step-progress",
          step: "glossary",
          message: `${completed}/${total}`,
          page: completed,
          totalPages: total,
        })
      },
    })
    storage.putNodeData("glossary", "book", glossary)

    progress.emit({
      type: "step-progress",
      step: "glossary",
      message: `${glossary.items.length} terms from ${glossary.pageCount} pages`,
    })
    progress.emit({ type: "step-complete", step: "glossary" })
    console.log(`[step-run] ${label}: glossary complete (${glossary.items.length} terms)`)
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}

// ---------------------------------------------------------------------------
// Translations step (text catalog + catalog translation)
// ---------------------------------------------------------------------------

async function runTranslationsStep(
  label: string,
  options: StepRunOptions,
  progress: StepRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    // Output languages default to editing language if not set
    const outputLanguages = Array.from(
      new Set(
        (config.output_languages && config.output_languages.length > 0
          ? config.output_languages
          : [language]).map((code) => normalizeLocale(code))
      )
    )

    // Step 1: Build text catalog (synchronous)
    progress.emit({ type: "step-start", step: "text-catalog" })
    progress.emit({ type: "step-progress", step: "text-catalog", message: "Building text catalog..." })

    console.log(`[step-run] ${label}: building text catalog from ${pages.length} pages`)

    const catalog = buildTextCatalog(storage, pages)
    storage.putNodeData("text-catalog", "book", catalog)

    progress.emit({
      type: "step-progress",
      step: "text-catalog",
      message: `${catalog.entries.length} entries`,
    })
    progress.emit({ type: "step-complete", step: "text-catalog" })

    // Step 2: Translate catalog to target languages
    const targetLanguages = getTargetLanguages(outputLanguages, language)
    if (targetLanguages.length === 0) {
      progress.emit({ type: "step-skip", step: "catalog-translation" })
      console.log(`[step-run] ${label}: translations skipped (no target languages)`)
      return
    }

    if (catalog.entries.length === 0) {
      progress.emit({ type: "step-skip", step: "catalog-translation" })
      console.log(`[step-run] ${label}: translations skipped (empty catalog)`)
      return
    }

    progress.emit({ type: "step-start", step: "catalog-translation" })

    const translationConfig = buildCatalogTranslationConfig(config, language)
    const translationModel = createLLMModel({
      modelId: translationConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
    })

    // Build flat list of batch work items
    const batchSize = translationConfig.batchSize
    interface WorkItem {
      language: string
      batchIndex: number
      entries: TextCatalogEntry[]
    }
    const workItems: WorkItem[] = []
    for (const lang of targetLanguages) {
      for (let i = 0; i < catalog.entries.length; i += batchSize) {
        workItems.push({
          language: lang,
          batchIndex: Math.floor(i / batchSize),
          entries: catalog.entries.slice(i, i + batchSize),
        })
      }
    }

    const totalBatches = workItems.length
    let completedBatches = 0

    const resultsByLang = new Map<string, TextCatalogEntry[]>()
    for (const lang of targetLanguages) {
      resultsByLang.set(lang, [])
    }

    progress.emit({
      type: "step-progress",
      step: "catalog-translation",
      message: `0/${totalBatches} batches (${targetLanguages.length} languages)`,
      page: 0,
      totalPages: totalBatches,
    })

    console.log(`[step-run] ${label}: translating ${catalog.entries.length} entries to ${targetLanguages.length} languages (${totalBatches} batches)`)

    await processWithConcurrency(
      workItems,
      effectiveConcurrency,
      async (item: WorkItem) => {
        const translated = await translateCatalogBatch(
          item.entries,
          item.language,
          translationConfig,
          translationModel
        )
        resultsByLang.get(item.language)!.push(...translated)
        completedBatches++
        progress.emit({
          type: "step-progress",
          step: "catalog-translation",
          message: `${completedBatches}/${totalBatches} batches`,
          page: completedBatches,
          totalPages: totalBatches,
        })
      }
    )

    // Store per-language results
    for (const lang of targetLanguages) {
      const entries = resultsByLang.get(lang)!
      // Sort entries back to original catalog order
      const idOrder = new Map(catalog.entries.map((e, i) => [e.id, i]))
      entries.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))

      const output: TextCatalogOutput = {
        entries,
        generatedAt: new Date().toISOString(),
      }
      storage.putNodeData("text-catalog-translation", lang, output)
    }

    progress.emit({ type: "step-complete", step: "catalog-translation" })
    console.log(`[step-run] ${label}: translations complete`)
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}

// ---------------------------------------------------------------------------
// Text-to-Speech step (text catalog + TTS generation)
// ---------------------------------------------------------------------------

async function runTextToSpeechStep(
  label: string,
  options: StepRunOptions,
  progress: StepRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookDir = path.join(path.resolve(booksDir), label)
    const configDir = configPath ? path.dirname(configPath) : path.resolve(process.cwd(), "config")

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

    const pages = storage.getPages()
    const effectiveConcurrency = config.concurrency ?? 32

    // Output languages default to editing language if not set
    const outputLanguages = Array.from(
      new Set(
        (config.output_languages && config.output_languages.length > 0
          ? config.output_languages
          : [language]).map((code) => normalizeLocale(code))
      )
    )

    // Step 1: Build text catalog (synchronous)
    progress.emit({ type: "step-start", step: "text-catalog" })
    progress.emit({ type: "step-progress", step: "text-catalog", message: "Building text catalog..." })

    console.log(`[step-run] ${label}: building text catalog from ${pages.length} pages`)

    const catalog = buildTextCatalog(storage, pages)
    storage.putNodeData("text-catalog", "book", catalog)

    progress.emit({
      type: "step-progress",
      step: "text-catalog",
      message: `${catalog.entries.length} entries`,
    })
    progress.emit({ type: "step-complete", step: "text-catalog" })

    if (catalog.entries.length === 0) {
      progress.emit({ type: "step-skip", step: "tts" })
      console.log(`[step-run] ${label}: TTS skipped (empty catalog)`)
      return
    }

    // Step 2: Generate TTS
    progress.emit({ type: "step-start", step: "tts" })

    // Load voice/instruction configs
    const voiceMaps = loadVoicesConfig(configDir)
    const instructionsMap = loadSpeechInstructions(configDir)

    const speechModel = config.speech?.model ?? "gpt-4o-mini-tts"
    const speechFormat = config.speech?.format ?? "mp3"
    const provider = "openai"
    const ttsSynthesizer = createTTSSynthesizer()

    // For output languages that differ from source, we need translated catalogs
    // Check if translations exist; if running TTS separately they should already exist
    const sourceLanguage = language

    interface TTSWorkItem {
      textId: string
      text: string
      language: string
    }
    const workItems: TTSWorkItem[] = []

    for (const lang of outputLanguages) {
      const baseSource = getBaseLanguage(sourceLanguage)
      const baseLang = getBaseLanguage(lang)

      let entries: TextCatalogEntry[]
      if (baseLang === baseSource) {
        entries = catalog.entries
      } else {
        const legacyLang = lang.replace("-", "_")
        const translatedRow =
          storage.getLatestNodeData("text-catalog-translation", lang) ??
          storage.getLatestNodeData("text-catalog-translation", legacyLang)
        if (translatedRow) {
          entries = (translatedRow.data as TextCatalogOutput).entries
        } else {
          console.warn(`[step-run] ${label}: missing translated catalog for ${lang}, skipping TTS for this language`)
          continue
        }
      }

      for (const entry of entries) {
        workItems.push({ textId: entry.id, text: entry.text, language: lang })
      }
    }

    const totalItems = workItems.length
    let completedItems = 0

    progress.emit({
      type: "step-progress",
      step: "tts",
      message: `0/${totalItems} entries`,
      page: 0,
      totalPages: totalItems,
    })

    console.log(`[step-run] ${label}: generating TTS for ${totalItems} entries across ${outputLanguages.length} languages`)

    const resultsByLang = new Map<string, SpeechFileEntry[]>()
    for (const lang of outputLanguages) {
      resultsByLang.set(lang, [])
    }

    await processWithConcurrency(
      workItems,
      effectiveConcurrency,
      async (item: TTSWorkItem) => {
        const voice = config.speech?.voice ?? resolveVoice(provider, item.language, voiceMaps)
        const instructions = resolveInstructions(item.language, instructionsMap)

        const entry = await generateSpeechFile({
          textId: item.textId,
          text: item.text,
          language: item.language,
          model: speechModel,
          voice,
          instructions,
          format: speechFormat,
          bookDir,
          cacheDir,
          ttsSynthesizer,
        })

        if (entry) {
          resultsByLang.get(item.language)?.push(entry)
        }

        completedItems++
        progress.emit({
          type: "step-progress",
          step: "tts",
          message: `${completedItems}/${totalItems} entries`,
          page: completedItems,
          totalPages: totalItems,
        })
      }
    )

    // Store per-language TTS metadata
    for (const lang of outputLanguages) {
      const entries = resultsByLang.get(lang)
      if (!entries) continue
      const output: TTSOutput = {
        entries,
        generatedAt: new Date().toISOString(),
      }
      storage.putNodeData("tts", lang, output)
    }

    progress.emit({ type: "step-complete", step: "tts" })
    console.log(`[step-run] ${label}: TTS complete`)
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}

interface ClassifyConfigs {
  textClassifyConfig: ReturnType<typeof buildClassifyConfig>
  imageClassifyConfig: ReturnType<typeof buildImageClassifyConfig>
}

interface ClassifyCallbacks {
  onClassifyImages: () => void
  onClassifyText: () => void
  onTranslate: () => void
}

async function classifyPage(
  page: PageData,
  storage: Storage,
  configs: ClassifyConfigs,
  llmModel: ReturnType<typeof createLLMModel>,
  callbacks: ClassifyCallbacks,
  translationConfig: TranslationConfig | null,
  translationModel: ReturnType<typeof createLLMModel> | null
): Promise<void> {
  const { textClassifyConfig, imageClassifyConfig } = configs

  const imageBase64 = storage.getPageImageBase64(page.pageId)
  const images = storage.getPageImages(page.pageId)

  // Start text classification (async) while doing image classification (sync)
  const textPromise = classifyPageText(
    {
      pageId: page.pageId,
      pageNumber: page.pageNumber,
      text: page.text,
      imageBase64,
    },
    textClassifyConfig,
    llmModel
  )

  try {
    const imageResult = classifyPageImages(page.pageId, images, imageClassifyConfig)
    storage.putNodeData("image-classification", page.pageId, imageResult)
    callbacks.onClassifyImages()
  } catch (err) {
    await textPromise.catch(() => undefined)
    wrapStepError("image-classification", err)
  }

  let textResult: Awaited<ReturnType<typeof classifyPageText>>
  try {
    textResult = await textPromise
    storage.putNodeData("text-classification", page.pageId, textResult)
    callbacks.onClassifyText()
  } catch (err) {
    wrapStepError("text-classification", err)
  }

  // Translate (if needed)
  if (translationConfig && translationModel) {
    try {
      const translated = await translatePageText(
        page.pageId,
        textResult as TextClassificationOutput,
        translationConfig,
        translationModel
      )
      storage.putNodeData("text-classification", page.pageId, translated)
      callbacks.onTranslate()
    } catch (err) {
      wrapStepError("translation", err)
    }
  }
}
