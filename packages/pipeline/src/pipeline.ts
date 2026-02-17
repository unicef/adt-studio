import fs from "node:fs"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import type { LLMModel, LogLevel } from "@adt/llm"
import { extractPDF } from "./pdf-extraction.js"
import { extractMetadata, buildMetadataConfig } from "./metadata-extraction.js"
import { classifyPageText, buildClassifyConfig } from "./text-classification.js"
import { classifyPageImages, buildImageClassifyConfig } from "./image-classification.js"
import { sectionPage, buildSectioningConfig } from "./page-sectioning.js"
import { renderPage, buildRenderStrategyResolver } from "./web-rendering.js"
import { translatePageText, buildTranslationConfig, type TranslationConfig } from "./translation.js"
import { createTemplateEngine, type TemplateEngine } from "./render-template.js"
import { loadBookConfig } from "./config.js"
import { nullProgress, type Progress } from "./progress.js"
import type {
  TextClassificationOutput,
  ImageClassificationOutput,
  PageSectioningOutput,
  BookMetadata,
} from "@adt/types"
import type { PageData } from "@adt/storage"

const DEFAULT_METADATA_PAGES = 3

export interface RunPipelineOptions {
  label: string
  pdfPath: string
  booksRoot: string
  startPage?: number
  endPage?: number
  concurrency?: number
  configPath?: string
  promptsDir: string
  templatesDir: string
  /** Override cache directory. Defaults to {booksRoot}/{label}/.cache */
  cacheDir?: string
  /** LLM console log level. Defaults to "info". Use "silent" for no output. */
  logLevel?: LogLevel
}

export async function runPipeline(
  options: RunPipelineOptions,
  progress: Progress = nullProgress
): Promise<void> {
  const {
    label,
    pdfPath,
    booksRoot,
    startPage,
    endPage,
    concurrency,
    configPath,
    promptsDir,
    templatesDir,
    logLevel,
  } = options

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`)
  }

  const storage = createBookStorage(label, booksRoot)

  // Copy source PDF into book directory so re-extraction can find it
  const bookDir = path.join(booksRoot, label)
  const destPdf = path.join(bookDir, `${label}.pdf`)
  const resolvedPdf = path.resolve(pdfPath)
  if (resolvedPdf !== path.resolve(destPdf)) {
    fs.copyFileSync(resolvedPdf, destPdf)
  }

  try {
    // Step 1: Extract PDF
    const config = loadBookConfig(label, booksRoot, configPath)

    const result = await extractPDF(
      {
        pdfPath,
        startPage: startPage ?? config.start_page,
        endPage: endPage ?? config.end_page,
        spreadMode: config.spread_mode,
      },
      storage,
      progress
    )

    // Step 2: Extract Metadata
    const metadataConfig = buildMetadataConfig(config)
    const cacheDir =
      options.cacheDir ?? path.join(booksRoot, label, ".cache")
    const templateEngine = createTemplateEngine(templatesDir)
    const promptEngine = createPromptEngine(promptsDir)
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

    const metadataModel = createLLMModel({
      modelId: metadataConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      logLevel,
      onLog: (entry) => storage.appendLlmLog(entry),
    })

    const pages = storage.getPages()
    const metadataPages = pages.slice(0, DEFAULT_METADATA_PAGES)
    const pageInputs = metadataPages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      imageBase64: storage.getPageImageBase64(page.pageId),
    }))

    progress.emit({ type: "step-start", step: "metadata" })
    let metadataResult: BookMetadata
    try {
      metadataResult = await extractMetadata(
        pageInputs,
        metadataConfig,
        metadataModel
      )
      storage.putNodeData("metadata", "book", metadataResult)
      progress.emit({ type: "step-complete", step: "metadata" })
    } catch (err) {
      progress.emit({
        type: "step-error",
        step: "metadata",
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }

    // Determine if translation is needed
    const translationConfig = buildTranslationConfig(
      config,
      metadataResult.language_code
    )
    const translationModel = translationConfig
      ? createLLMModel({
          modelId: translationConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          logLevel,
          onLog: (entry) => storage.appendLlmLog(entry),
        })
      : null

    // Step 3: Create Storyboard (per-page classification, sectioning, rendering)
    const textClassifyConfig = buildClassifyConfig(config)
    const imageClassifyConfig = {
      ...buildImageClassifyConfig(config),
      getImageBytes: (imageId: string) =>
        Buffer.from(storage.getImageBase64(imageId), "base64"),
    }
    const sectioningConfig = buildSectioningConfig(config)
    const resolveRenderConfig = buildRenderStrategyResolver(config)
    const llmModel = createLLMModel({
      modelId: textClassifyConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      logLevel,
      onLog: (entry) => storage.appendLlmLog(entry),
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
        logLevel,
        onLog: (entry) => storage.appendLlmLog(entry),
      })
      renderModels.set(modelId, model)
      return model
    }

    const effectiveConcurrency = concurrency ?? config.concurrency ?? 32

    await processWithConcurrency(
      pages,
      effectiveConcurrency,
      async (page, index, totalPages) => {
        await processPage(
          label,
          page,
          index,
          totalPages,
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
          translationConfig,
          translationModel
        )
      }
    )
    progress.emit({ type: "step-complete", step: "web-rendering" })
  } finally {
    storage.close()
  }
}

interface StepConfigs {
  textClassifyConfig: ReturnType<typeof buildClassifyConfig>
  imageClassifyConfig: ReturnType<typeof buildImageClassifyConfig>
  sectioningConfig: ReturnType<typeof buildSectioningConfig>
  resolveRenderConfig: ReturnType<typeof buildRenderStrategyResolver>
}

async function processPage(
  label: string,
  page: PageData,
  pageIndex: number,
  totalPages: number,
  storage: Storage,
  configs: StepConfigs,
  llmModel: ReturnType<typeof createLLMModel>,
  resolveRenderModel: (modelId: string) => LLMModel,
  templateEngine: TemplateEngine,
  progress: Progress,
  translationConfig: TranslationConfig | null,
  translationModel: LLMModel | null
): Promise<void> {
  const { textClassifyConfig, imageClassifyConfig, sectioningConfig, resolveRenderConfig } =
    configs

  // --- Classify ---
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

  const imageResult = classifyPageImages(page.pageId, images, imageClassifyConfig)
  storage.putNodeData("image-classification", page.pageId, imageResult)
  progress.emit({
    type: "step-progress",
    step: "image-classification",
    message: page.pageId,
    page: pageIndex,
    totalPages,
  })

  const textResult = await textPromise
  storage.putNodeData("text-classification", page.pageId, textResult)
  progress.emit({
    type: "step-progress",
    step: "text-classification",
    message: page.pageId,
    page: pageIndex,
    totalPages,
  })

  // --- Translate (if needed) ---
  let textClassification = textResult as TextClassificationOutput
  if (translationConfig && translationModel) {
    textClassification = await translatePageText(
      page.pageId,
      textClassification,
      translationConfig,
      translationModel
    )
    storage.putNodeData("text-classification", page.pageId, textClassification)
    progress.emit({
      type: "step-progress",
      step: "translation",
      message: page.pageId,
      page: pageIndex,
      totalPages,
    })
  }
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
  progress.emit({
    type: "step-progress",
    step: "page-sectioning",
    message: page.pageId,
    page: pageIndex,
    totalPages,
  })

  // --- Render ---
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
      images: renderImages,
    },
    resolveRenderConfig,
    resolveRenderModel,
    templateEngine
  )
  storage.putNodeData("web-rendering", page.pageId, renderResult)
  progress.emit({
    type: "step-progress",
    step: "web-rendering",
    message: page.pageId,
    page: pageIndex,
    totalPages,
  })
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number, total: number) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>()
  const total = items.length
  for (const [index, item] of items.entries()) {
    const p = fn(item, index + 1, total).finally(() => {
      executing.delete(p)
    })
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)
}
