import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import type { LLMModel, LlmLogEntry } from "@adt/llm"
import {
  extractPDF,
  extractMetadata,
  buildMetadataConfig,
  classifyPageText,
  buildClassifyConfig,
  classifyPageImages,
  buildImageClassifyConfig,
  sectionPage,
  buildSectioningConfig,
  renderPage,
  buildRenderStrategyResolver,
  createTemplateEngine,
  loadBookConfig,
} from "@adt/pipeline"
import type { TemplateEngine } from "@adt/pipeline"
import type {
  TextClassificationOutput,
  ImageClassificationOutput,
  PageSectioningOutput,
  StepName,
} from "@adt/types"
import type { PageData } from "@adt/storage"
import type {
  PipelineRunner,
  PipelineProgress,
  StartPipelineOptions,
} from "./pipeline-service.js"

const DEFAULT_METADATA_PAGES = 3

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

/**
 * Creates the real pipeline runner that executes all pipeline steps.
 * Mirrors the flow from packages/pipeline/src/cli.ts but adapted for API use.
 */
export function createPipelineRunner(): PipelineRunner {
  return {
    async run(
      label: string,
      options: StartPipelineOptions,
      progress: PipelineProgress
    ): Promise<void> {
      const { booksDir, apiKey, promptsDir, configPath } = options

      // Set API key for the openai() provider
      const previousKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = apiKey

      const storage = createBookStorage(label, booksDir)

      try {
        // Resolve book PDF path
        const pdfPath = path.join(
          path.resolve(booksDir),
          label,
          `${label}.pdf`
        )

        // Step 1: Extract PDF
        await extractPDF(
          {
            pdfPath,
            startPage: options.startPage,
            endPage: options.endPage,
          },
          storage,
          progress
        )

        // Step 2: Extract Metadata
        const config = loadBookConfig(label, booksDir, configPath)
        const metadataConfig = buildMetadataConfig(config)
        const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
        const promptEngine = createPromptEngine(promptsDir)
        const templatesDir = path.join(path.dirname(promptsDir), "templates")
        const templateEngine = createTemplateEngine(templatesDir)
        const rateLimiter = config.rate_limit
          ? createRateLimiter(config.rate_limit.requests_per_minute)
          : undefined

        const metadataModel = createLLMModel({
          modelId: metadataConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: (entry) => {
            storage.appendLlmLog(entry)
            progress.emit({
              type: "llm-log",
              step: "metadata",
              itemId: entry.pageId ?? "",
              promptName: entry.promptName,
              modelId: entry.modelId,
              cacheHit: entry.cacheHit,
              durationMs: entry.durationMs,
              inputTokens: entry.usage?.inputTokens,
              outputTokens: entry.usage?.outputTokens,
              validationErrors: entry.validationErrors,
            })
          },
        })

        const pages = storage.getPages()
        const metadataPages = pages.slice(0, DEFAULT_METADATA_PAGES)
        const pageInputs = metadataPages.map((page) => ({
          pageNumber: page.pageNumber,
          text: page.text,
          imageBase64: storage.getPageImageBase64(page.pageId),
        }))

        progress.emit({ type: "step-start", step: "metadata" })
        const metadataResult = await extractMetadata(
          pageInputs,
          metadataConfig,
          metadataModel
        )
        storage.putNodeData("metadata", "book", metadataResult)
        progress.emit({ type: "step-complete", step: "metadata" })

        // Step 3: Per-page processing (classify → section → render)
        const textClassifyConfig = buildClassifyConfig(config)
        const imageClassifyConfig = buildImageClassifyConfig(config)
        const sectioningConfig = buildSectioningConfig(config)
        const resolveRenderConfig = buildRenderStrategyResolver(config)

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
          modelId: textClassifyConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
        })
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

        const effectiveConcurrency =
          options.concurrency ?? config.concurrency ?? 32

        const totalPages = pages.length
        let completedClassifyText = 0
        let completedClassifyImages = 0
        let completedSection = 0
        let completedRender = 0

        const failedPages: string[] = []

        await processWithConcurrency(
          pages,
          effectiveConcurrency,
          async (page: PageData) => {
            try {
              await processPage(
                label,
                page,
                storage,
                {
                  textClassifyConfig,
                  imageClassifyConfig,
                  sectioningConfig,
                  resolveRenderConfig,
                },
                llmModel,
                resolveRenderModel,
                templateEngine,
                progress,
                totalPages,
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
                  onSection: () => {
                    completedSection++
                    progress.emit({
                      type: "step-progress",
                      step: "page-sectioning",
                      message: `${completedSection}/${totalPages}`,
                      page: completedSection,
                      totalPages,
                    })
                  },
                  onRender: () => {
                    completedRender++
                    progress.emit({
                      type: "step-progress",
                      step: "web-rendering",
                      message: `${completedRender}/${totalPages}`,
                      page: completedRender,
                      totalPages,
                    })
                  },
                }
              )
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              failedPages.push(`${page.pageId}: ${msg}`)
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

        // Emit completion for all per-page steps
        progress.emit({
          type: "step-complete",
          step: "text-classification",
        })
        progress.emit({
          type: "step-complete",
          step: "image-classification",
        })
        progress.emit({ type: "step-complete", step: "page-sectioning" })
        progress.emit({ type: "step-complete", step: "web-rendering" })
      } finally {
        storage.close()
        // Restore previous API key
        if (previousKey !== undefined) {
          process.env.OPENAI_API_KEY = previousKey
        } else {
          delete process.env.OPENAI_API_KEY
        }
      }
    },
  }
}

interface StepConfigs {
  textClassifyConfig: ReturnType<typeof buildClassifyConfig>
  imageClassifyConfig: ReturnType<typeof buildImageClassifyConfig>
  sectioningConfig: ReturnType<typeof buildSectioningConfig>
  resolveRenderConfig: ReturnType<typeof buildRenderStrategyResolver>
}

interface PageCallbacks {
  onClassifyImages: () => void
  onClassifyText: () => void
  onSection: () => void
  onRender: () => void
}

async function processPage(
  label: string,
  page: PageData,
  storage: Storage,
  configs: StepConfigs,
  llmModel: ReturnType<typeof createLLMModel>,
  resolveRenderModel: (modelId: string) => LLMModel,
  templateEngine: TemplateEngine,
  _progress: PipelineProgress,
  _totalPages: number,
  callbacks: PageCallbacks
): Promise<void> {
  const {
    textClassifyConfig,
    imageClassifyConfig,
    sectioningConfig,
    resolveRenderConfig,
  } = configs

  // Classify images (sync) + text (async)
  const imageBase64 = storage.getPageImageBase64(page.pageId)
  const images = storage.getPageImages(page.pageId)

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

  const imageResult = classifyPageImages(
    page.pageId,
    images,
    imageClassifyConfig
  )
  storage.putNodeData("image-classification", page.pageId, imageResult)
  callbacks.onClassifyImages()

  const textResult = await textPromise
  storage.putNodeData("text-classification", page.pageId, textResult)
  callbacks.onClassifyText()

  // Section page
  const textClassification = textResult as TextClassificationOutput
  const imageClassification = imageResult as ImageClassificationOutput

  const allImages = storage.getPageImages(page.pageId)
  const prunedImageIds = new Set(
    imageClassification.images
      .filter((img) => img.isPruned)
      .map((img) => img.imageId)
  )
  const sectionImages = allImages
    .filter((img) => !prunedImageIds.has(img.imageId))
    .map((img) => ({
      imageId: img.imageId,
      imageBase64: storage.getImageBase64(img.imageId),
    }))

  const pageImageBase64 = storage.getPageImageBase64(page.pageId)
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
  callbacks.onSection()

  // Render page
  const sectioning = sectionResult as PageSectioningOutput
  const renderImages = new Map<string, string>()
  for (const img of allImages) {
    if (!prunedImageIds.has(img.imageId)) {
      renderImages.set(img.imageId, storage.getImageBase64(img.imageId))
    }
  }

  const renderResult = await renderPage(
    {
      label,
      pageId: page.pageId,
      pageImageBase64,
      sectioning,
      textClassification,
      images: renderImages,
    },
    resolveRenderConfig,
    resolveRenderModel,
    templateEngine
  )
  storage.putNodeData("web-rendering", page.pageId, renderResult)
  callbacks.onRender()
}
