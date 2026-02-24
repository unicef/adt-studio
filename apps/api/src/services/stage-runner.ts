import crypto from "node:crypto"
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
  resolveProviderForLanguage,
  generateSpeechFile,
  generateBookSummary,
  buildBookSummaryConfig,
  filterPageImageMeaningfulness,
  buildMeaningfulnessConfig,
  cropPageImages,
  applyCrops,
  buildCroppingConfig,
  getCroppedImageId,
  segmentPageImages,
  applySegmentation,
  buildSegmentationConfig,
  getSegmentedImageId,
} from "@adt/pipeline"
import type { TranslationConfig, QuizPageInput, ProviderRouting, MeaningfulnessConfig, CroppingConfig, SegmentationConfig } from "@adt/pipeline"
import { loadStyleguideContent } from "./styleguide.js"
import { createTTSSynthesizer, createAzureTTSSynthesizer } from "@adt/llm"
import type { TTSSynthesizer } from "@adt/llm"
import { STAGE_ORDER } from "@adt/types"
import type {
  AppConfig,
  TextClassificationOutput,
  ImageClassificationOutput,
  PageSectioningOutput,
  WebRenderingOutput,
  TextCatalogOutput,
  TextCatalogEntry,
  SpeechFileEntry,
  TTSOutput,
  StepName,
  StageName,
  BookSummaryOutput,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import type { PageData } from "@adt/storage"
import type {
  StageRunner,
  StageRunProgress,
  StageRunOptions,
} from "./stage-service.js"

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

export function buildStageRunnerImageClassifyConfig(
  config: AppConfig,
  storage: Pick<Storage, "getImageBase64">
): ReturnType<typeof buildImageClassifyConfig> {
  return {
    ...buildImageClassifyConfig(config),
    getImageBytes: (imageId: string) =>
      Buffer.from(storage.getImageBase64(imageId), "base64"),
  }
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

type RunFn = (label: string, options: StageRunOptions, progress: StageRunProgress) => Promise<void>

const STAGE_RUNNERS: Record<StageName, RunFn> = {
  "extract": runExtractStep,
  "storyboard": runStoryboardStep,
  "quizzes": runQuizzesStep,
  "captions": runCaptionsStep,
  "glossary": runGlossaryStep,
  "text-and-speech": runTextAndSpeechStep,
  "package": async () => { /* packaging handled separately */ },
}

/**
 * Creates a stage runner that executes pipeline stages.
 * Supports single stages (fromStage === toStage) and ranges (e.g. extract → storyboard).
 * Stage ordering comes from the shared PIPELINE definition.
 */
export function createStageRunner(): StageRunner {
  return {
    async run(
      label: string,
      options: StageRunOptions,
      progress: StageRunProgress
    ): Promise<void> {
      const { fromStage, toStage, booksDir } = options
      console.log(`[stage-run] ${label}: starting ${fromStage}→${toStage}`)

      const fromIndex = STAGE_ORDER.indexOf(fromStage as StageName)
      const toIndex = STAGE_ORDER.indexOf(toStage as StageName)

      if (fromIndex === -1 || toIndex === -1 || fromIndex > toIndex) {
        throw new Error(`Invalid stage range "${fromStage}" to "${toStage}"`)
      }

      // Wrap progress to persist step lifecycle to the DB.
      // This is the single place where step state transitions are recorded,
      // so the step-status endpoint can read from step_runs.
      const completionStorage = createBookStorage(label, booksDir)
      try {
        const trackingProgress: StageRunProgress = {
          emit(event) {
            if (event.type === "step-start") {
              completionStorage.markStepStarted(event.step)
            } else if (event.type === "step-complete") {
              completionStorage.markStepCompleted(event.step)
            } else if (event.type === "step-skip") {
              completionStorage.markStepSkipped(event.step)
            } else if (event.type === "step-error") {
              completionStorage.recordStepError(event.step, event.error)
            } else if (event.type === "step-progress" && event.message) {
              completionStorage.updateStepMessage(event.step, event.message)
            }
            progress.emit(event)
          },
        }

        for (let i = fromIndex; i <= toIndex; i++) {
          const stage = STAGE_ORDER[i]
          await STAGE_RUNNERS[stage](label, options, trackingProgress)
        }
      } finally {
        completionStorage.close()
      }

      console.log(`[stage-run] ${label}: completed ${fromStage}→${toStage}`)
    },
  }
}

async function runExtractStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const pdfPath = path.join(path.resolve(booksDir), label, `${label}.pdf`)
    const config = loadBookConfig(label, booksDir, configPath)

    // Step 1: Extract PDF
    console.log(`[stage-run] ${label}: extracting PDF from ${pdfPath}`)
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
    console.log(`[stage-run] ${label}: PDF extraction complete`)

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

    console.log(`[stage-run] ${label}: extracting metadata from ${metadataPages.length} pages`)
    progress.emit({ type: "step-start", step: "metadata" })
    const metadataResult = await extractMetadata(
      pageInputs,
      metadataConfig,
      metadataModel
    )
    storage.putNodeData("metadata", "book", metadataResult)
    progress.emit({ type: "step-complete", step: "metadata" })
    console.log(`[stage-run] ${label}: metadata complete (lang=${metadataResult.language_code})`)

    // Determine if translation is needed
    const translationConfig = buildTranslationConfig(
      config,
      metadataResult.language_code
    )

    // Step 3: Per-page classification
    const textClassifyConfig = buildClassifyConfig(config)
    const imageClassifyConfig = buildStageRunnerImageClassifyConfig(config, storage)
    const meaningfulnessConfig = buildMeaningfulnessConfig(config)
    const segmentationConfig = buildSegmentationConfig(config)
    const croppingConfig = buildCroppingConfig(config)

    const llmModel = createLLMModel({
      modelId: textClassifyConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
    })

    const meaningfulnessModel = meaningfulnessConfig
      ? createLLMModel({
          modelId: meaningfulnessConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
        })
      : null

    const segmentationModel = segmentationConfig
      ? createLLMModel({
          modelId: segmentationConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
        })
      : null

    const croppingModel = croppingConfig
      ? createLLMModel({
          modelId: croppingConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
        })
      : null

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
    console.log(`[stage-run] ${label}: classifying ${totalPages} pages (concurrency=${effectiveConcurrency})`)
    let completedClassifyText = 0
    let completedClassifyImages = 0
    let completedCropping = 0
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
            { textClassifyConfig, imageClassifyConfig, meaningfulnessConfig, segmentationConfig, croppingConfig },
            llmModel,
            {
              onClassifyImages: () => {
                completedClassifyImages++
                progress.emit({
                  type: "step-progress",
                  step: "image-filtering",
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
              onCrop: () => {
                completedCropping++
                progress.emit({
                  type: "step-progress",
                  step: "image-cropping",
                  message: `${completedCropping}/${totalPages}`,
                  page: completedCropping,
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
            translationModel,
            meaningfulnessModel,
            segmentationModel,
            croppingModel
          )
        } catch (err) {
          const msg = toErrorMessage(err)
          const step =
            err instanceof StepError ? err.step : "text-classification"
          console.error(`[stage-run] ${label}: ${page.pageId} failed at ${step}: ${msg}`)
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
    progress.emit({ type: "step-complete", step: "image-filtering" })
    if (segmentationConfig) {
      progress.emit({ type: "step-complete", step: "image-segmentation" })
    } else {
      progress.emit({ type: "step-skip", step: "image-segmentation" })
    }
    if (croppingConfig) {
      progress.emit({ type: "step-complete", step: "image-cropping" })
    } else {
      progress.emit({ type: "step-skip", step: "image-cropping" })
    }
    if (meaningfulnessConfig) {
      progress.emit({ type: "step-complete", step: "image-meaningfulness" })
    } else {
      progress.emit({ type: "step-skip", step: "image-meaningfulness" })
    }
    progress.emit({ type: "step-complete", step: "text-classification" })
    if (translationConfig) {
      progress.emit({ type: "step-complete", step: "translation" })
    } else {
      progress.emit({ type: "step-skip", step: "translation" })
    }

    // Generate book summary from page text
    progress.emit({ type: "step-start", step: "book-summary" })
    try {
      const bookSummaryConfig = buildBookSummaryConfig(config)
      const summaryModel = createLLMModel({
        modelId: bookSummaryConfig.modelId,
        cacheDir,
        promptEngine,
        rateLimiter,
        onLog: onLlmLog,
      })
      const summaryPages = pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
      }))
      const summaryResult = await generateBookSummary(
        summaryPages,
        bookSummaryConfig,
        summaryModel
      )
      storage.putNodeData("book-summary", "book", summaryResult)
      progress.emit({ type: "step-complete", step: "book-summary" })
      console.log(`[stage-run] ${label}: book summary complete`)
    } catch (err) {
      const msg = toErrorMessage(err)
      console.error(`[stage-run] ${label}: book summary failed: ${msg}`)
      progress.emit({
        type: "step-error",
        step: "book-summary",
        error: msg,
      })
      throw err
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
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath, renderOnly } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)

    const styleguideContent = loadStyleguideContent(config.styleguide, configPath)

    // Render config is always needed
    const resolveRenderConfig = buildRenderStrategyResolver(config)

    // Shared infrastructure for LLM calls
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

    if (renderOnly) {
      // -- RENDER-ONLY PATH --
      // Skip sectioning, re-render from existing page-sectioning data
      console.log(
        `[stage-run] ${label}: re-rendering storyboard for ${totalPages} pages (concurrency=${effectiveConcurrency})`
      )

      progress.emit({ type: "step-skip", step: "page-sectioning" })

      let completedRendering = 0
      const failedPages: string[] = []

      await processWithConcurrency(
        pages,
        effectiveConcurrency,
        async (page: PageData) => {
          try {
            // Read existing sectioning data
            const sectioningRow = storage.getLatestNodeData("page-sectioning", page.pageId)
            if (!sectioningRow) {
              console.log(
                `[stage-run] ${label}: skipping ${page.pageId} (no existing sectioning)`
              )
              completedRendering++
              progress.emit({
                type: "step-progress",
                step: "web-rendering",
                message: `${completedRendering}/${totalPages}`,
                page: completedRendering,
                totalPages,
              })
              return
            }
            const sectioning = sectioningRow.data as PageSectioningOutput

            // Build render images map from page images
            const allImages = storage.getPageImages(page.pageId)
            const renderImages = new Map<string, string>()
            for (const img of allImages) {
              renderImages.set(img.imageId, storage.getImageBase64(img.imageId))
            }

            const pageImageBase64 = storage.getPageImageBase64(page.pageId)

            // Web rendering
            console.log(
              `[stage-run] ${label}: rendering ${page.pageId}`
            )
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
            console.error(
              `[stage-run] ${label}: ${page.pageId} failed at web-rendering: ${msg}`
            )
            failedPages.push(`${page.pageId} [web-rendering]: ${msg}`)
            progress.emit({
              type: "step-error",
              step: "web-rendering",
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

      progress.emit({ type: "step-complete", step: "web-rendering" })
      console.log(`[stage-run] ${label}: storyboard re-render complete`)
    } else {
      // -- FULL RUN PATH --
      // Sectioning config and LLM model only needed for full run
      const sectioningConfig = buildSectioningConfig(config)
      const llmModel = createLLMModel({
        modelId: sectioningConfig.modelId,
        cacheDir,
        promptEngine,
        rateLimiter,
        onLog: onLlmLog,
      })

      console.log(
        `[stage-run] ${label}: running storyboard for ${totalPages} pages (concurrency=${effectiveConcurrency})`
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
                `[stage-run] ${label}: skipping ${page.pageId} (no text-classification)`
              )
              return
            }
            const textClassification = textClassificationRow.data as TextClassificationOutput

            // Get image-filtering data
            const imageClassificationRow = storage.getLatestNodeData(
              "image-filtering",
              page.pageId
            )
            const imageClassification = (imageClassificationRow?.data as ImageClassificationOutput) ?? { images: [] }

            // Get page image
            const pageImageBase64 = storage.getPageImageBase64(page.pageId)

            // Build image lists from classification (includes crop entries).
            // Fallback to stored page images for partial runs where classification is missing.
            const classifiedUnprunedImageIds = imageClassification.images
              .filter((img) => !img.isPruned)
              .map((img) => img.imageId)
            const unprunedImageIds = imageClassificationRow
              ? classifiedUnprunedImageIds
              : storage.getPageImages(page.pageId).map((img) => img.imageId)

            const sectionImages = unprunedImageIds.map((imageId) => ({
              imageId,
              imageBase64: storage.getImageBase64(imageId),
            }))

            // Page sectioning
            console.log(
              `[stage-run] ${label}: sectioning ${page.pageId}`
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

            // Build render images map from classification
            const renderImages = new Map<string, string>()
            for (const imageId of unprunedImageIds) {
              renderImages.set(imageId, storage.getImageBase64(imageId))
            }

            // Web rendering
            console.log(
              `[stage-run] ${label}: rendering ${page.pageId}`
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
              `[stage-run] ${label}: ${page.pageId} failed at ${step}: ${msg}`
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
      console.log(`[stage-run] ${label}: storyboard complete`)
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

// ---------------------------------------------------------------------------
// Quizzes step
// ---------------------------------------------------------------------------

async function runQuizzesStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
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
      console.log(`[stage-run] ${label}: quizzes skipped (disabled in config)`)
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
    console.log(`[stage-run] ${label}: quizzes complete`)
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
  options: StageRunOptions,
  progress: StageRunProgress
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

    // Load book summary for captioning context
    const summaryRow = storage.getLatestNodeData("book-summary", "book")
    const bookSummary = (summaryRow?.data as BookSummaryOutput | undefined)?.summary

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

    console.log(`[stage-run] ${label}: captioning ${totalPages} pages (concurrency=${effectiveConcurrency})`)

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
            { pageId: page.pageId, pageImageBase64, images, language, bookSummary },
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
    console.log(`[stage-run] ${label}: captions complete`)
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
  options: StageRunOptions,
  progress: StageRunProgress
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

    console.log(`[stage-run] ${label}: generating glossary from ${pages.length} pages`)

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
    console.log(`[stage-run] ${label}: glossary complete (${glossary.items.length} terms)`)
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
// Text & Speech stage (text catalog + catalog translation + TTS)
// ---------------------------------------------------------------------------

async function runTextAndSpeechStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, apiKey, promptsDir, configPath } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookDir = path.join(path.resolve(booksDir), label)
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const configDir = configPath
      ? path.join(path.dirname(configPath), "config")
      : path.resolve(process.cwd(), "config")

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

    // ── Step 1: Build text catalog ──────────────────────────────────
    progress.emit({ type: "step-start", step: "text-catalog" })
    progress.emit({ type: "step-progress", step: "text-catalog", message: "Building text catalog..." })

    console.log(`[stage-run] ${label}: building text catalog from ${pages.length} pages`)

    const catalog = buildTextCatalog(storage, pages)
    storage.putNodeData("text-catalog", "book", catalog)

    progress.emit({
      type: "step-progress",
      step: "text-catalog",
      message: `${catalog.entries.length} entries`,
    })
    progress.emit({ type: "step-complete", step: "text-catalog" })

    // ── Step 2: Translate catalog to target languages ────────────────
    const targetLanguages = getTargetLanguages(outputLanguages, language)
    if (targetLanguages.length === 0 || catalog.entries.length === 0) {
      progress.emit({ type: "step-skip", step: "catalog-translation" })
      console.log(`[stage-run] ${label}: catalog translation skipped`)
    } else {
      progress.emit({ type: "step-start", step: "catalog-translation" })

      const translationConfig = buildCatalogTranslationConfig(config, language)
      const translationModel = createLLMModel({
        modelId: translationConfig.modelId,
        cacheDir,
        promptEngine,
        rateLimiter,
        onLog: onLlmLog,
      })

      const batchSize = translationConfig.batchSize
      interface TranslationWorkItem {
        language: string
        batchIndex: number
        entries: TextCatalogEntry[]
      }
      const workItems: TranslationWorkItem[] = []
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

      console.log(`[stage-run] ${label}: translating ${catalog.entries.length} entries to ${targetLanguages.length} languages (${totalBatches} batches)`)

      await processWithConcurrency(
        workItems,
        effectiveConcurrency,
        async (item: TranslationWorkItem) => {
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

      for (const lang of targetLanguages) {
        const entries = resultsByLang.get(lang)!
        const idOrder = new Map(catalog.entries.map((e, i) => [e.id, i]))
        entries.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))

        const output: TextCatalogOutput = {
          entries,
          generatedAt: new Date().toISOString(),
        }
        storage.putNodeData("text-catalog-translation", lang, output)
      }

      progress.emit({ type: "step-complete", step: "catalog-translation" })
      console.log(`[stage-run] ${label}: catalog translation complete`)
    }

    // ── Step 3: Generate TTS ────────────────────────────────────────
    if (catalog.entries.length === 0) {
      progress.emit({ type: "step-skip", step: "tts" })
      console.log(`[stage-run] ${label}: TTS skipped (empty catalog)`)
      return
    }

    progress.emit({ type: "step-start", step: "tts" })

    const voiceMaps = loadVoicesConfig(configDir)
    const instructionsMap = loadSpeechInstructions(configDir)

    const speechModel = config.speech?.model ?? "gpt-4o-mini-tts"
    const speechFormat = config.speech?.format ?? "mp3"
    const defaultProvider = config.speech?.default_provider ?? "openai"
    const providerConfigs = config.speech?.providers ?? {}
    const routing: ProviderRouting = { providers: providerConfigs, defaultProvider }

    console.log(`[stage-run] ${label}: TTS configDir=${configDir} voiceMaps=${Object.keys(voiceMaps).join(",")||"(empty)"}`)
    console.log(`[stage-run] ${label}: TTS config — defaultProvider=${defaultProvider} model=${speechModel} format=${speechFormat}`)
    console.log(`[stage-run] ${label}: TTS providers=${JSON.stringify(providerConfigs)}`)
    console.log(`[stage-run] ${label}: TTS azureKey=${options.azureSpeechKey ? "set" : "NOT SET"} azureRegion=${options.azureSpeechRegion ?? "NOT SET"}`)

    const synthesizers = new Map<string, TTSSynthesizer>()
    function getSynthesizer(providerName: string): TTSSynthesizer {
      if (synthesizers.has(providerName)) return synthesizers.get(providerName)!
      console.log(`[stage-run] ${label}: creating TTS synthesizer for provider="${providerName}"`)
      if (providerName === "azure") {
        if (!options.azureSpeechKey || !options.azureSpeechRegion) {
          throw new Error("Azure Speech key and region are required for Azure TTS provider. Set them in the API Keys dialog (gear icon).")
        }
        const synth = createAzureTTSSynthesizer(
          { subscriptionKey: options.azureSpeechKey, region: options.azureSpeechRegion },
          { sampleRate: config.speech?.sample_rate, bitRate: config.speech?.bit_rate }
        )
        synthesizers.set("azure", synth)
        return synth
      }
      const synth = createTTSSynthesizer()
      synthesizers.set(providerName, synth)
      return synth
    }

    const sourceLanguage = language

    interface TTSWorkItem {
      textId: string
      text: string
      language: string
    }
    const ttsWorkItems: TTSWorkItem[] = []

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
          console.warn(`[stage-run] ${label}: missing translated catalog for ${lang}, skipping TTS for this language`)
          continue
        }
      }

      for (const entry of entries) {
        ttsWorkItems.push({ textId: entry.id, text: entry.text, language: lang })
      }
    }

    const totalItems = ttsWorkItems.length
    let completedItems = 0

    progress.emit({
      type: "step-progress",
      step: "tts",
      message: `0/${totalItems} entries`,
      page: 0,
      totalPages: totalItems,
    })

    console.log(`[stage-run] ${label}: generating TTS for ${totalItems} entries across ${outputLanguages.length} languages (${outputLanguages.join(", ")})`)
    console.log(`[stage-run] ${label}: TTS routing — for each language: ${outputLanguages.map((l) => `${l}→${resolveProviderForLanguage(l, routing)}`).join(", ")}`)

    const ttsResultsByLang = new Map<string, SpeechFileEntry[]>()
    for (const lang of outputLanguages) {
      ttsResultsByLang.set(lang, [])
    }

    const failedItems: string[] = []

    await processWithConcurrency(
      ttsWorkItems,
      effectiveConcurrency,
      async (item: TTSWorkItem) => {
        const startMs = Date.now()
        const provider = resolveProviderForLanguage(item.language, routing)
        const providerModel = providerConfigs[provider]?.model ?? (provider === "azure" ? "azure-tts" : speechModel)
        const voice = config.speech?.voice ?? resolveVoice(provider, item.language, voiceMaps)
        const instructions = provider === "openai"
          ? resolveInstructions(item.language, instructionsMap)
          : ""

        console.log(`[stage-run] ${label}: TTS ${item.textId} → provider=${provider} voice=${voice} model=${providerModel}`)

        try {
          const ttsSynthesizer = getSynthesizer(provider)

          const entry = await generateSpeechFile({
            textId: item.textId,
            text: item.text,
            language: item.language,
            model: providerModel,
            voice,
            instructions,
            format: speechFormat,
            bookDir,
            cacheDir,
            ttsSynthesizer,
            provider,
          })

          const durationMs = Date.now() - startMs
          const cached = entry?.cached ?? false

          const logEntry: LlmLogEntry = {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            taskType: "tts",
            pageId: item.textId,
            promptName: `tts-${provider}`,
            modelId: `${provider}/${providerModel}`,
            cacheHit: cached,
            success: true,
            errorCount: 0,
            attempt: 1,
            durationMs,
            messages: [{
              role: "user",
              content: [{ type: "text" as const, text: `[${item.language}] voice=${voice}\n${item.text.slice(0, 300)}` }],
            }],
          }
          storage.appendLlmLog(logEntry)
          progress.emit({
            type: "llm-log",
            step: "tts",
            itemId: item.textId,
            promptName: logEntry.promptName,
            modelId: logEntry.modelId,
            cacheHit: cached,
            durationMs,
          })

          if (entry) {
            ttsResultsByLang.get(item.language)?.push(entry)
          }
        } catch (err) {
          const msg = toErrorMessage(err)
          const durationMs = Date.now() - startMs
          console.error(`[stage-run] ${label}: TTS failed for ${item.textId} (${item.language}): ${msg}`)
          failedItems.push(`${item.textId}: ${msg}`)

          const logEntry: LlmLogEntry = {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            taskType: "tts",
            pageId: item.textId,
            promptName: `tts-${provider}`,
            modelId: `${provider}/${providerModel}`,
            cacheHit: false,
            success: false,
            errorCount: 1,
            attempt: 1,
            durationMs,
            messages: [{
              role: "user",
              content: [{ type: "text" as const, text: `[${item.language}] voice=${voice}\nERROR: ${msg}\n\n${item.text.slice(0, 300)}` }],
            }],
          }
          storage.appendLlmLog(logEntry)
          progress.emit({
            type: "llm-log",
            step: "tts",
            itemId: item.textId,
            promptName: logEntry.promptName,
            modelId: logEntry.modelId,
            cacheHit: false,
            durationMs,
          })
          progress.emit({
            type: "step-error",
            step: "tts",
            error: `${item.textId} failed: ${msg}`,
          })
        }

        completedItems++
        progress.emit({
          type: "step-progress",
          step: "tts",
          message: `${completedItems}/${totalItems} entries${failedItems.length > 0 ? ` (${failedItems.length} failed)` : ""}`,
          page: completedItems,
          totalPages: totalItems,
        })
      }
    )

    if (failedItems.length > 0) {
      console.error(`[stage-run] ${label}: ${failedItems.length} TTS item(s) failed:\n${failedItems.join("\n")}`)
    }

    for (const lang of outputLanguages) {
      const entries = ttsResultsByLang.get(lang)
      if (!entries) continue
      const output: TTSOutput = {
        entries,
        generatedAt: new Date().toISOString(),
      }
      storage.putNodeData("tts", lang, output)
    }

    progress.emit({ type: "step-complete", step: "tts" })
    console.log(`[stage-run] ${label}: text & speech complete`)
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
  meaningfulnessConfig: MeaningfulnessConfig | null
  segmentationConfig: SegmentationConfig | null
  croppingConfig: CroppingConfig | null
}

interface ClassifyCallbacks {
  onClassifyImages: () => void
  onClassifyText: () => void
  onCrop: () => void
  onTranslate: () => void
}

async function classifyPage(
  page: PageData,
  storage: Storage,
  configs: ClassifyConfigs,
  llmModel: ReturnType<typeof createLLMModel>,
  callbacks: ClassifyCallbacks,
  translationConfig: TranslationConfig | null,
  translationModel: ReturnType<typeof createLLMModel> | null,
  meaningfulnessModel: ReturnType<typeof createLLMModel> | null,
  segmentationModel: ReturnType<typeof createLLMModel> | null,
  croppingModel: ReturnType<typeof createLLMModel> | null
): Promise<void> {
  const { textClassifyConfig, imageClassifyConfig, meaningfulnessConfig, segmentationConfig, croppingConfig } = configs

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

  let imageResult: ImageClassificationOutput
  try {
    imageResult = classifyPageImages(page.pageId, images, imageClassifyConfig)
    callbacks.onClassifyImages()
  } catch (err) {
    await textPromise.catch(() => undefined)
    wrapStepError("image-filtering", err)
    return // unreachable but satisfies TS
  }

  // LLM meaningfulness filter (if enabled)
  if (meaningfulnessConfig && meaningfulnessModel) {
    try {
      const unprunedImageIds = new Set(
        imageResult.images
          .filter((img) => !img.isPruned)
          .map((img) => img.imageId)
      )
      const unprunedImages = images
        .filter((img) => unprunedImageIds.has(img.imageId))
        .map((img) => ({
          imageId: img.imageId,
          imageBase64: storage.getImageBase64(img.imageId),
          width: img.width,
          height: img.height,
        }))

      if (unprunedImages.length > 0) {
        imageResult = await filterPageImageMeaningfulness(
          {
            pageId: page.pageId,
            pageImageBase64: imageBase64,
            images: unprunedImages,
          },
          imageResult,
          meaningfulnessConfig,
          meaningfulnessModel
        )
      }
    } catch (err) {
      await textPromise.catch(() => undefined)
      wrapStepError("image-filtering", err)
    }
  }

  storage.putNodeData("image-filtering", page.pageId, imageResult)

  // LLM segmentation (if enabled) — splits composited images into individual segments
  if (segmentationConfig && segmentationModel) {
    try {
      const unprunedIds = new Set(
        imageResult.images
          .filter((img) => !img.isPruned)
          .map((img) => img.imageId)
      )
      const segMinSide = segmentationConfig.minSide
      const unprunedImages = images
        .filter((img) => unprunedIds.has(img.imageId))
        .filter((img) => segMinSide === undefined || Math.min(img.width, img.height) >= segMinSide)
        .map((img) => ({
          imageId: img.imageId,
          imageBase64: storage.getImageBase64(img.imageId),
          width: img.width,
          height: img.height,
        }))

      if (unprunedImages.length > 0) {
        const segmentationResult = await segmentPageImages(
          {
            pageId: page.pageId,
            pageImageBase64: imageBase64,
            images: unprunedImages,
          },
          segmentationConfig,
          segmentationModel
        )
        const segVersion = storage.putNodeData("image-segmentation", page.pageId, segmentationResult)
        const segDims = new Map(images.map((img) => [img.imageId, { width: img.width, height: img.height }]))
        const applied = applySegmentation(
          segmentationResult,
          (imageId) => storage.getImageBase64(imageId),
          segDims,
        )
        for (const seg of applied) {
          storage.putSegmentedImage({
            sourceImageId: seg.sourceImageId,
            segmentIndex: seg.segmentIndex,
            pageId: page.pageId,
            version: segVersion,
            buffer: seg.buffer,
            width: seg.width,
            height: seg.height,
          })
          imageResult.images.push({
            imageId: getSegmentedImageId(seg.sourceImageId, seg.segmentIndex, segVersion),
            isPruned: false,
          })
        }
        // Mark segmented originals as pruned
        if (applied.length > 0) {
          const segmentedSourceIds = new Set(applied.map((s) => s.sourceImageId))
          for (const sourceId of segmentedSourceIds) {
            const origEntry = imageResult.images.find((i) => i.imageId === sourceId)
            if (origEntry) {
              origEntry.isPruned = true
              origEntry.reason = "segmented"
            }
          }
          storage.putNodeData("image-filtering", page.pageId, imageResult)
        }
      }
    } catch (err) {
      // Segmentation is non-fatal — log error but continue
      console.error(`[stage-run] image segmentation failed for ${page.pageId}: ${toErrorMessage(err)}`)
    }
  }

  // LLM cropping (if enabled)
  if (croppingConfig && croppingModel) {
    try {
      const prunedIds = new Set(
        imageResult.images
          .filter((img) => img.isPruned)
          .map((img) => img.imageId)
      )
      const unprunedImages = images
        .filter((img) => !prunedIds.has(img.imageId))
        .map((img) => ({
          imageId: img.imageId,
          imageBase64: storage.getImageBase64(img.imageId),
          width: img.width,
          height: img.height,
        }))

      if (unprunedImages.length > 0) {
        const croppingResult = await cropPageImages(
          {
            pageId: page.pageId,
            pageImageBase64: imageBase64,
            images: unprunedImages,
          },
          croppingConfig,
          croppingModel
        )
        const croppingVersion = storage.putNodeData("image-cropping", page.pageId, croppingResult)
        const applied = applyCrops(
          croppingResult,
          (imageId) => storage.getImageBase64(imageId)
        )
        for (const crop of applied) {
          storage.putCroppedImage({
            imageId: crop.imageId,
            pageId: page.pageId,
            version: croppingVersion,
            buffer: crop.buffer,
            width: crop.width,
            height: crop.height,
          })
          // Mark original as pruned in classification
          const origEntry = imageResult.images.find((i) => i.imageId === crop.imageId)
          if (origEntry) {
            origEntry.isPruned = true
            origEntry.reason = "cropped"
          }
          // Add crop as new unpruned image
          imageResult.images.push({
            imageId: getCroppedImageId(crop.imageId, croppingVersion),
            isPruned: false,
          })
        }
        if (applied.length > 0) {
          storage.putNodeData("image-filtering", page.pageId, imageResult)
        }
      }
    } catch (err) {
      // Cropping is non-fatal — log error but continue
      console.error(`[stage-run] image cropping failed for ${page.pageId}: ${toErrorMessage(err)}`)
    } finally {
      callbacks.onCrop()
    }
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
