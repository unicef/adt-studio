import fs from "node:fs"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage, PageData } from "@adt/storage"
import {
  createLLMModel,
  createPromptEngine,
  createRateLimiter,
  createTTSSynthesizer,
  createAzureTTSSynthesizer,
  createGeminiTTSSynthesizer,
} from "@adt/llm"
import type { LLMModel, LlmLogEntry, LogLevel, TTSSynthesizer } from "@adt/llm"
import type {
  StepName,
  ImageClassificationOutput,
  PageSectioningOutput,
  BookMetadata,
  BookSummaryOutput,
  TextCatalogOutput,
  TextCatalogEntry,
  EasyReadOutput,
  SpeechFileEntry,
  TTSOutput,
  WebRenderingOutput,
} from "@adt/types"
import { extractPDF } from "./pdf-extraction.js"
import { extractMetadata, buildMetadataConfig } from "./metadata-extraction.js"
import { generateBookSummary, buildBookSummaryConfig } from "./book-summary.js"
import {
  sectionPage,
  buildPageSectioningConfig,
} from "./page-sectioning.js"
import { classifyPageImages, buildImageClassifyConfig } from "./image-filtering.js"
import { filterPageImageMeaningfulness, buildMeaningfulnessConfig } from "./image-meaningfulness.js"
import { cropPageImages, applyCrops, buildCroppingConfig, getCroppedImageId } from "./image-cropping.js"
import { segmentPageImages, applySegmentation, buildSegmentationConfig, getSegmentedImageId } from "./image-segmentation.js"
import { renderPage, buildRenderStrategyResolver } from "./web-rendering.js"
import { translatePageTree, buildTranslationConfig } from "./translation.js"
import { createTemplateEngine } from "./render-template.js"
import { captionPageImages, buildCaptionConfig, extractImageIds } from "./image-captioning.js"
import { generateGlossary, buildGlossaryConfig } from "./glossary.js"
import { generateToc, buildTocGenerationConfig } from "./toc-generation.js"
import { generateAllQuizzes, buildQuizGenerationConfig, type QuizPageInput } from "./quiz-generation.js"
import { buildTextCatalog } from "./text-catalog.js"
import { buildEasyReadConfig, buildEasyReadSourceBlocks, createEmptyEasyReadOutput, generateEasyRead, flattenEasyReadEntries, isDeterministicEmptyEasyReadOutput } from "./easy-read.js"
import { translateCatalogBatch, buildCatalogTranslationConfig, getTargetLanguages } from "./catalog-translation.js"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"
import {
  loadVoicesConfig,
  loadSpeechInstructions,
  resolveVoice,
  resolveInstructions,
  resolveProviderForLanguage,
  resolveSpeechModel,
  resolveSpeechFormat,
  generateSpeechFile,
  type ProviderRouting,
} from "./speech.js"
import { packageAdtWeb } from "./package-web.js"
import { processFixedLayoutPages, isFixedLayoutBook } from "./fixed-layout-rendering.js"
import { runAccessibilityAssessment } from "./accessibility-assessment.js"
import { loadBookConfig } from "./config.js"
import { nullProgress, type Progress } from "./progress.js"
import { processWithConcurrency } from "./concurrency.js"
import { runPipelineDAG, type StepExecutor, type PipelineDAGResult } from "./dag.js"

const DEFAULT_METADATA_PAGES = 3

/**
 * Wrap a Progress so only step-progress and llm-log events pass through.
 * Used when delegating to functions (extractPDF, packageAdtWeb) that emit
 * their own step-start/step-complete — the DAG runner handles those.
 */
function progressOnly(p: Progress): Progress {
  return {
    emit: (e) => {
      if (e.type === "step-progress" || e.type === "llm-log") {
        p.emit(e)
      }
    },
  }
}

export interface FullPipelineOptions {
  label: string
  pdfPath: string
  booksRoot: string
  startPage?: number
  endPage?: number
  concurrency?: number
  configPath?: string
  promptsDir: string
  templatesDir: string
  cacheDir?: string
  logLevel?: LogLevel
  /** Path to config directory (voices.yaml, speech_instructions.yaml). */
  configDir?: string
  /** Path to the ADT runner assets directory (assets/adt/). */
  webAssetsDir?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
  geminiApiKey?: string
}

/**
 * Run the full pipeline using the DAG runner.
 *
 * Run the full pipeline using the DAG runner for CLI use.
 */
export async function runFullPipeline(
  options: FullPipelineOptions,
  progress: Progress = nullProgress,
): Promise<PipelineDAGResult> {
  const {
    label,
    pdfPath,
    booksRoot,
    startPage,
    endPage,
    configPath,
    promptsDir,
    templatesDir,
    logLevel,
  } = options

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`)
  }

  const storage = createBookStorage(label, booksRoot)

  // Copy source PDF into book directory
  const bookDir = path.join(booksRoot, label)
  const destPdf = path.join(bookDir, `${label}.pdf`)
  const resolvedPdf = path.resolve(pdfPath)
  if (resolvedPdf !== path.resolve(destPdf)) {
    fs.copyFileSync(resolvedPdf, destPdf)
  }

  try {
    const config = loadBookConfig(label, booksRoot, configPath)
    const cacheDir = options.cacheDir ?? path.join(path.resolve(booksRoot), label, ".cache")
    const promptEngine = createPromptEngine(promptsDir)
    const templateEngine = createTemplateEngine(templatesDir)
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const effectiveConcurrency = options.concurrency ?? config.concurrency ?? 32

    // LLM log handler: write to storage and emit event
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

    // Shared model cache — avoids duplicates for same modelId
    const modelCache = new Map<string, LLMModel>()
    const getModel = (modelId: string): LLMModel => {
      let model = modelCache.get(modelId)
      if (!model) {
        model = createLLMModel({ modelId, cacheDir, promptEngine, rateLimiter, logLevel, onLog: onLlmLog })
        modelCache.set(modelId, model)
      }
      return model
    }

    // Build all step configs upfront
    const metadataConfig = buildMetadataConfig(config)
    const pageSectioningConfig = buildPageSectioningConfig(config)
    const imageClassifyConfig = buildImageClassifyConfig(config)
    const meaningfulnessConfig = buildMeaningfulnessConfig(config)
    const segmentationConfig = buildSegmentationConfig(config)
    const croppingConfig = buildCroppingConfig(config)
    const resolveRenderConfig = buildRenderStrategyResolver(config)
    const captionConfig = buildCaptionConfig(config)

    // Build executors
    const executors = new Map<StepName, StepExecutor>()

    // ── Extract stage ───────────────────────────────────────────

    executors.set("extract", async (p) => {
      await extractPDF(
        {
          pdfPath,
          startPage: startPage ?? config.start_page,
          endPage: endPage ?? config.end_page,
          spreadMode: config.spread_mode,
          vectorTextGrouping: config.vector_text_grouping,
          // Gates the positioned-text pipeline (fixed-layout rendering is its
          // only consumer). Must match stage-runner so re-runs are consistent.
          fixedLayout: isFixedLayoutBook(config),
        },
        storage,
        progressOnly(p),
      )
    })

    executors.set("metadata", async (p) => {
      const pages = storage.getPages()
      const metadataPages = pages.slice(0, DEFAULT_METADATA_PAGES)
      const pageInputs = metadataPages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        imageBase64: storage.getPageImageBase64(page.pageId),
      }))
      const model = getModel(metadataConfig.modelId)
      const result = await extractMetadata(pageInputs, metadataConfig, model)
      storage.putNodeData("metadata", "book", result)
    })

    executors.set("book-summary", async () => {
      const pages = storage.getPages()
      const summaryPages = pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
      }))
      // Resolve the language from the metadata step (book-summary depends on it)
      // so the summary is written in the book's actual language, not English.
      const bookSummaryConfig = buildBookSummaryConfig(config, getLanguage(storage, config))
      const model = getModel(bookSummaryConfig.modelId)
      const result = await generateBookSummary(summaryPages, bookSummaryConfig, model)
      storage.putNodeData("book-summary", "book", result)
    })

    executors.set("image-filtering", async (p) => {
      const pages = storage.getPages()
      const totalPages = pages.length
      const classifyConfig = {
        ...imageClassifyConfig,
        getImageBytes: (imageId: string) =>
          Buffer.from(storage.getImageBase64(imageId), "base64"),
      }
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const images = storage.getPageImages(page.pageId)
        const result = classifyPageImages(page.pageId, images, classifyConfig)
        storage.putNodeData("image-filtering", page.pageId, result)
        p.emit({
          type: "step-progress",
          step: "image-filtering",
          message: page.pageId,
          page: pages.indexOf(page) + 1,
          totalPages,
        })
      })
    })

    executors.set("image-segmentation", async (p) => {
      if (!segmentationConfig) return
      const model = getModel(segmentationConfig.modelId)
      const pages = storage.getPages()
      const totalPages = pages.length
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const classRow = storage.getLatestNodeData("image-filtering", page.pageId)
        if (!classRow) return
        const imageClassification = classRow.data as ImageClassificationOutput
        const unprunedImageIds = new Set(
          imageClassification.images.filter((img) => !img.isPruned).map((img) => img.imageId)
        )
        const allImages = storage.getPageImages(page.pageId)
        const segMinSide = segmentationConfig.minSide
        const unprunedImages = allImages
          .filter((img) => unprunedImageIds.has(img.imageId))
          .filter((img) => segMinSide === undefined || Math.min(img.width, img.height) >= segMinSide)
          .map((img) => ({
            imageId: img.imageId,
            imageBase64: storage.getImageBase64(img.imageId),
            width: img.width,
            height: img.height,
          }))
        if (unprunedImages.length > 0) {
          try {
            const pageImageBase64 = storage.getPageImageBase64(page.pageId)
            const segmentationResult = await segmentPageImages(
              { pageId: page.pageId, pageImageBase64, images: unprunedImages },
              segmentationConfig,
              model,
            )
            const segVersion = storage.putNodeData("image-segmentation", page.pageId, segmentationResult)
            const segDims = new Map(allImages.map((img) => [img.imageId, { width: img.width, height: img.height }]))
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
              const segImageId = getSegmentedImageId(seg.sourceImageId, seg.segmentIndex, segVersion)
              imageClassification.images.push({
                imageId: segImageId,
                isPruned: false,
              })
            }
            // Mark segmented originals as pruned
            if (applied.length > 0) {
              const segmentedSourceIds = new Set(applied.map((s) => s.sourceImageId))
              for (const sourceId of segmentedSourceIds) {
                const origEntry = imageClassification.images.find((i) => i.imageId === sourceId)
                if (origEntry) {
                  origEntry.isPruned = true
                  origEntry.reason = "segmented"
                }
              }
              storage.putNodeData("image-filtering", page.pageId, imageClassification)
            }
          } catch (err) {
            console.warn(
              `[image-segmentation] Failed for ${page.pageId}:`,
              err instanceof Error ? err.message : err
            )
          }
        }
        p.emit({
          type: "step-progress",
          step: "image-segmentation",
          message: page.pageId,
          page: pages.indexOf(page) + 1,
          totalPages,
        })
      })
    })

    executors.set("image-meaningfulness", async (p) => {
      if (!meaningfulnessConfig) return
      const model = getModel(meaningfulnessConfig.modelId)
      const pages = storage.getPages()
      const totalPages = pages.length
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const classRow = storage.getLatestNodeData("image-filtering", page.pageId)
        if (!classRow) return
        let imageResult = classRow.data as ImageClassificationOutput
        const unprunedImageIds = new Set(
          imageResult.images.filter((img) => !img.isPruned).map((img) => img.imageId)
        )
        const images = storage.getPageImages(page.pageId)
        const unprunedImages = images
          .filter((img) => unprunedImageIds.has(img.imageId))
          .map((img) => ({
            imageId: img.imageId,
            imageBase64: storage.getImageBase64(img.imageId),
            width: img.width,
            height: img.height,
          }))
        if (unprunedImages.length > 0) {
          const pageImageBase64 = storage.getPageImageBase64(page.pageId)
          imageResult = await filterPageImageMeaningfulness(
            { pageId: page.pageId, pageImageBase64, images: unprunedImages },
            imageResult,
            meaningfulnessConfig,
            model,
          )
          storage.putNodeData("image-filtering", page.pageId, imageResult)
        }
        p.emit({
          type: "step-progress",
          step: "image-meaningfulness",
          message: page.pageId,
          page: pages.indexOf(page) + 1,
          totalPages,
        })
      })
    })

    executors.set("image-cropping", async (p) => {
      if (!croppingConfig) return
      const model = getModel(croppingConfig.modelId)
      const pages = storage.getPages()
      const totalPages = pages.length
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const classRow = storage.getLatestNodeData("image-filtering", page.pageId)
        if (!classRow) return
        const imageClassification = classRow.data as ImageClassificationOutput
        const prunedImageIds = new Set(
          imageClassification.images.filter((img) => img.isPruned).map((img) => img.imageId)
        )
        const allImages = storage.getPageImages(page.pageId)
        const unprunedImages = allImages
          .filter((img) => !prunedImageIds.has(img.imageId))
          .map((img) => ({
            imageId: img.imageId,
            imageBase64: storage.getImageBase64(img.imageId),
            width: img.width,
            height: img.height,
          }))
        if (unprunedImages.length > 0) {
          const pageImageBase64 = storage.getPageImageBase64(page.pageId)
          const croppingResult = await cropPageImages(
            { pageId: page.pageId, pageImageBase64, images: unprunedImages },
            croppingConfig,
            model,
          )
          const croppingVersion = storage.putNodeData("image-cropping", page.pageId, croppingResult)
          const applied = applyCrops(
            croppingResult,
            (imageId) => storage.getImageBase64(imageId),
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
            const origEntry = imageClassification.images.find((i) => i.imageId === crop.imageId)
            if (origEntry) {
              origEntry.isPruned = true
              origEntry.reason = "cropped"
            }
            imageClassification.images.push({
              imageId: getCroppedImageId(crop.imageId, croppingVersion),
              isPruned: false,
            })
          }
          if (applied.length > 0) {
            storage.putNodeData("image-filtering", page.pageId, imageClassification)
          }
        }
        p.emit({
          type: "step-progress",
          step: "image-cropping",
          message: page.pageId,
          page: pages.indexOf(page) + 1,
          totalPages,
        })
      })
    })

    // ── Sectioning stage ─────────────────────────────────────────

    const isFixedLayout = isFixedLayoutBook(config)

    executors.set("page-sectioning", async (p) => {
      if (isFixedLayout) {
        // Fixed-layout: both sectioning and rendering happen here, driven
        // off the positioned-text + image-filtering data the extract step
        // already wrote. No LLM call.
        const imageUrlPrefix = `/api/books/${label}/images`
        processFixedLayoutPages(storage, imageUrlPrefix)
        p.emit({ type: "step-progress", step: "page-sectioning", message: "fixed-layout pages" })
        return
      }
      const model = getModel(pageSectioningConfig.modelId)
      const pages = storage.getPages()
      const totalPages = pages.length
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const imageClassRow = storage.getLatestNodeData("image-filtering", page.pageId)
        if (!imageClassRow) return
        const imageClassification = imageClassRow.data as ImageClassificationOutput
        const unprunedImageIds = imageClassification.images
          .filter((img) => !img.isPruned)
          .map((img) => img.imageId)
        const availableImages = unprunedImageIds.map((imageId) => ({
          imageId,
          imageBase64: storage.getImageBase64(imageId),
        }))
        const imageBase64 = storage.getPageImageBase64(page.pageId)
        const result = await sectionPage(
          {
            pageId: page.pageId,
            pageNumber: page.pageNumber,
            text: page.text,
            imageBase64,
            availableImages,
          },
          pageSectioningConfig,
          model,
        )
        storage.putNodeData("page-sectioning", page.pageId, result)
        p.emit({
          type: "step-progress",
          step: "page-sectioning",
          message: page.pageId,
          page: pages.indexOf(page) + 1,
          totalPages,
        })
      })
    })

    executors.set("translation", async (p) => {
      const metadataRow = storage.getLatestNodeData("metadata", "book")
      const metadata = metadataRow?.data as BookMetadata | null
      const translationConfig = buildTranslationConfig(config, metadata?.language_code ?? null)
      if (!translationConfig) return
      const model = getModel(translationConfig.modelId)
      const pages = storage.getPages()
      const totalPages = pages.length
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const row = storage.getLatestNodeData("page-sectioning", page.pageId)
        if (!row) return
        const sectioning = row.data as PageSectioningOutput
        const translated = await translatePageTree(
          page.pageId,
          sectioning,
          translationConfig,
          model,
        )
        storage.putNodeData("page-sectioning", page.pageId, translated)
        p.emit({
          type: "step-progress",
          step: "translation",
          message: page.pageId,
          page: pages.indexOf(page) + 1,
          totalPages,
        })
      })
    })

    executors.set("web-rendering", async (p) => {
      // Fixed-layout rendering is already done in page-sectioning step
      if (isFixedLayout) return

      const renderModels = new Map<string, LLMModel>()
      const resolveRenderModel = (modelId: string): LLMModel => {
        let model = renderModels.get(modelId)
        if (!model) {
          model = getModel(modelId)
          renderModels.set(modelId, model)
        }
        return model
      }
      const pages = storage.getPages()
      const totalPages = pages.length
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const structuringRow = storage.getLatestNodeData("page-sectioning", page.pageId)
        const imageClassRow = storage.getLatestNodeData("image-filtering", page.pageId)
        if (!structuringRow || !imageClassRow) return
        const sectioning = structuringRow.data as PageSectioningOutput
        const imageClassification = imageClassRow.data as ImageClassificationOutput
        const unprunedImageIds = imageClassification.images
          .filter((img) => !img.isPruned)
          .map((img) => img.imageId)
        const pageDims = new Map(storage.getPageImages(page.pageId).map((img) => [img.imageId, { width: img.width, height: img.height }]))
        const renderImages = new Map<string, { base64: string; width?: number; height?: number }>()
        for (const imageId of unprunedImageIds) {
          const dims = pageDims.get(imageId)
          renderImages.set(imageId, { base64: storage.getImageBase64(imageId), width: dims?.width, height: dims?.height })
        }
        const pageImageBase64 = storage.getPageImageBase64(page.pageId)
        const result = await renderPage(
          { label, pageId: page.pageId, pageImageBase64, sectioning: sectioning, images: renderImages },
          resolveRenderConfig,
          resolveRenderModel,
          templateEngine,
        )
        storage.putNodeData("web-rendering", page.pageId, result)
        p.emit({
          type: "step-progress",
          step: "web-rendering",
          message: page.pageId,
          page: pages.indexOf(page) + 1,
          totalPages,
        })
      })

    })

    // ── Quizzes stage ───────────────────────────────────────────

    executors.set("quiz-generation", async (p) => {
      const language = getLanguage(storage, config)
      const quizConfig = buildQuizGenerationConfig(config, language)
      if (!quizConfig) return
      const model = getModel(quizConfig.modelId)
      const pages = storage.getPages()
      const quizPages: QuizPageInput[] = []
      for (const page of pages) {
        const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
        const structuringRow = storage.getLatestNodeData("page-sectioning", page.pageId)
        if (!renderingRow || !structuringRow) continue
        quizPages.push({
          pageId: page.pageId,
          rendering: renderingRow.data as WebRenderingOutput,
          sectioning: structuringRow.data as PageSectioningOutput,
        })
      }
      if (quizPages.length > 0) {
        const result = await generateAllQuizzes(quizPages, quizConfig, model, {
          concurrency: effectiveConcurrency,
          onQuizComplete: (completed, total) => {
            p.emit({
              type: "step-progress",
              step: "quiz-generation",
              message: `${completed}/${total}`,
              page: completed,
              totalPages: total,
            })
          },
        })
        storage.putNodeData("quiz-generation", "book", result)
      }
    })

    // ── Captions stage ──────────────────────────────────────────

    executors.set("image-captioning", async (p) => {
      const language = getLanguage(storage, config)
      const model = getModel(captionConfig.modelId)
      const summaryRow = storage.getLatestNodeData("book-summary", "book")
      const bookSummary = (summaryRow?.data as BookSummaryOutput | undefined)?.summary
      const pages = storage.getPages()
      const totalPages = pages.length
      let completed = 0
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
        if (!renderingRow) return
        const rendering = renderingRow.data as WebRenderingOutput
        const structuringRow = storage.getLatestNodeData("page-sectioning", page.pageId)
        const sectioning = structuringRow?.data as PageSectioningOutput | undefined
        const htmlSections = rendering.sections
          .filter((s) => !sectioning?.sections[s.sectionIndex]?.isPruned)
          .map((s) => s.html)
        const imageIds = extractImageIds(htmlSections)
        if (imageIds.length === 0) {
          storage.putNodeData("image-captioning", page.pageId, { captions: [] })
        } else {
          const images = imageIds.map((imageId) => ({
            imageId,
            imageBase64: storage.getImageBase64(imageId),
          }))
          const pageImageBase64 = storage.getPageImageBase64(page.pageId)
          const result = await captionPageImages(
            { pageId: page.pageId, pageImageBase64, images, language, bookSummary },
            captionConfig,
            model,
          )
          storage.putNodeData("image-captioning", page.pageId, result)
        }
        completed++
        p.emit({
          type: "step-progress",
          step: "image-captioning",
          message: `${completed}/${totalPages}`,
          page: completed,
          totalPages,
        })
      })
    })

    // ── Glossary stage ──────────────────────────────────────────

    executors.set("glossary", async (p) => {
      const language = getLanguage(storage, config)
      const glossaryConfig = buildGlossaryConfig(config, language)
      const model = getModel(glossaryConfig.modelId)
      const pages = storage.getPages()
      const glossary = await generateGlossary({
        storage,
        pages,
        config: glossaryConfig,
        llmModel: model,
        concurrency: effectiveConcurrency,
        onBatchComplete: (completed, total) => {
          p.emit({
            type: "step-progress",
            step: "glossary",
            message: `${completed}/${total}`,
            page: completed,
            totalPages: total,
          })
        },
      })
      storage.putNodeData("glossary", "book", glossary)
    })

    // ── TOC stage ───────────────────────────────────────────────

    executors.set("toc-generation", async (p) => {
      const language = getLanguage(storage, config)
      const tocConfig = buildTocGenerationConfig(config, language)
      const model = getModel(tocConfig.modelId)
      const pages = storage.getPages()

      p.emit({ type: "step-progress", step: "toc-generation", message: "Analyzing book structure..." })

      const toc = await generateToc({
        storage,
        pages,
        config: tocConfig,
        llmModel: model,
      })
      storage.putNodeData("toc-generation", "book", toc)

      p.emit({
        type: "step-progress",
        step: "toc-generation",
        message: `${toc.entries.length} entries`,
      })
    })

    // ── Translate + Speech stages ────────────────────────────────

    executors.set("text-catalog", async () => {
      const pages = storage.getPages()
      const catalog = await buildTextCatalog(storage, pages)
      storage.putNodeData("text-catalog", "book", catalog)
    })

    executors.set("easy-read", async (p) => {
      const easyReadConfig = buildEasyReadConfig(config, getLanguage(storage, config))
      if (!easyReadConfig.enabled) return
      const pages = storage.getPages()
      const blocks = buildEasyReadSourceBlocks(storage, pages)
      if (blocks.length === 0) {
        const existingEasyRead = storage.getLatestNodeData("easy-read", "book")?.data
        if (!isDeterministicEmptyEasyReadOutput(existingEasyRead)) {
          storage.putNodeData("easy-read", "book", createEmptyEasyReadOutput())
        }
        return
      }
      const model = getModel(easyReadConfig.modelId)
      const totalEntries = blocks.reduce((sum, block) => sum + block.entries.length, 0)
      const output = await generateEasyRead(blocks, easyReadConfig, model, {
        concurrency: effectiveConcurrency,
        onProgress: (completed, total) => {
          p.emit({
            type: "step-progress",
            step: "easy-read",
            message: `${completed}/${total}`,
            page: completed,
            totalPages: total,
          })
        },
      })
      storage.putNodeData("easy-read", "book", output)
      p.emit({
        type: "step-progress",
        step: "easy-read",
        message: `${totalEntries} entries`,
      })
    })

    executors.set("catalog-translation", async (p) => {
      const language = getLanguage(storage, config)
      const outputLanguages = getOutputLanguages(config, language)
      const targetLanguages = getTargetLanguages(outputLanguages, language)
      if (targetLanguages.length === 0) return
      const catalogRow = storage.getLatestNodeData("text-catalog", "book")
      if (!catalogRow) return
      const catalog = catalogRow.data as TextCatalogOutput
      const easyReadRow = storage.getLatestNodeData("easy-read", "book")
      const easyReadEntries = flattenEasyReadEntries(easyReadRow?.data as EasyReadOutput | undefined)
      const translationEntries = [...catalog.entries, ...easyReadEntries]
      if (translationEntries.length === 0) return
      const translationConfig = buildCatalogTranslationConfig(config, language)
      const model = getModel(translationConfig.modelId)
      const batchSize = translationConfig.batchSize
      interface WorkItem { language: string; batchIndex: number; entries: TextCatalogEntry[] }
      const workItems: WorkItem[] = []
      for (const lang of targetLanguages) {
        for (let i = 0; i < translationEntries.length; i += batchSize) {
          workItems.push({ language: lang, batchIndex: Math.floor(i / batchSize), entries: translationEntries.slice(i, i + batchSize) })
        }
      }
      const totalBatches = workItems.length
      let completedBatches = 0
      const resultsByLang = new Map<string, TextCatalogEntry[]>()
      for (const lang of targetLanguages) resultsByLang.set(lang, [])
      await processWithConcurrency(workItems, effectiveConcurrency, async (item) => {
        const translated = await translateCatalogBatch(item.entries, item.language, translationConfig, model)
        resultsByLang.get(item.language)!.push(...translated)
        completedBatches++
        p.emit({
          type: "step-progress",
          step: "catalog-translation",
          message: `${completedBatches}/${totalBatches} batches`,
          page: completedBatches,
          totalPages: totalBatches,
        })
      })
      for (const lang of targetLanguages) {
        const entries = resultsByLang.get(lang)!
        const idOrder = new Map(translationEntries.map((e, i) => [e.id, i]))
        entries.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
        storage.putNodeData("text-catalog-translation", lang, { entries, generatedAt: new Date().toISOString() })
      }
    })

    executors.set("tts", async (p) => {
      const language = getLanguage(storage, config)
      const easyReadConfig = buildEasyReadConfig(config, language)
      const outputLanguages = getOutputLanguages(config, language)
      const catalogRow = storage.getLatestNodeData("text-catalog", "book")
      if (!catalogRow) return
      const sourceCatalog = catalogRow.data as TextCatalogOutput
      const easyReadRow = storage.getLatestNodeData("easy-read", "book")
      // Easy Read audio is generated for every language (source included)
      // whenever Easy Read is enabled — target languages already carry the
      // easy-read entries via text-catalog-translation, so gate the source
      // side on `enabled` to match.
      const easyReadEntries = easyReadConfig.enabled
        ? flattenEasyReadEntries(easyReadRow?.data as EasyReadOutput | undefined)
        : []
      const sourceEntries = [...sourceCatalog.entries, ...easyReadEntries]
      if (sourceEntries.length === 0) return

      const configDir = options.configDir ?? path.resolve(process.cwd(), "config")
      const azureConfig = options.azureSpeechKey && options.azureSpeechRegion
        ? { subscriptionKey: options.azureSpeechKey, region: options.azureSpeechRegion }
        : undefined
      const geminiConfig = options.geminiApiKey
        ? { apiKey: options.geminiApiKey }
        : undefined
      const voiceMaps = loadVoicesConfig(configDir)
      const instructionsMap = loadSpeechInstructions(configDir)
      const speechModel = config.speech?.model
      const defaultProvider = config.speech?.default_provider ?? "openai"
      const providerConfigs = config.speech?.providers ?? {}
      const routing: ProviderRouting = { providers: providerConfigs, defaultProvider }

      const synthesizers = new Map<string, TTSSynthesizer>()
      function getSynthesizer(providerName: string): TTSSynthesizer {
        if (synthesizers.has(providerName)) return synthesizers.get(providerName)!
        if (providerName === "azure") {
          if (!azureConfig) throw new Error("Azure Speech key and region are required for Azure TTS provider")
          const synth = createAzureTTSSynthesizer(azureConfig, { sampleRate: config.speech?.sample_rate, bitRate: config.speech?.bit_rate })
          synthesizers.set("azure", synth)
          return synth
        }
        if (providerName === "gemini") {
          if (!geminiConfig && !process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY is required for Gemini TTS provider")
          }
          const synth = createGeminiTTSSynthesizer(geminiConfig)
          synthesizers.set("gemini", synth)
          return synth
        }
        const synth = createTTSSynthesizer()
        synthesizers.set(providerName, synth)
        return synth
      }

      interface TTSWorkItem { textId: string; text: string; language: string }
      const workItems: TTSWorkItem[] = []
      for (const lang of outputLanguages) {
        const baseSource = getBaseLanguage(language)
        const baseLang = getBaseLanguage(lang)
        let entries: TextCatalogEntry[]
        if (baseLang === baseSource) {
          entries = sourceEntries
        } else {
          const legacyLang = lang.replace("-", "_")
          const translatedRow =
            storage.getLatestNodeData("text-catalog-translation", lang) ??
            storage.getLatestNodeData("text-catalog-translation", legacyLang)
          if (!translatedRow) throw new Error(`Missing translated catalog for output language: ${lang}`)
          entries = (translatedRow.data as TextCatalogOutput).entries
        }
        for (const entry of entries) {
          workItems.push({ textId: entry.id, text: entry.text, language: lang })
        }
      }

      const totalItems = workItems.length
      let completedItems = 0
      const resultsByLang = new Map<string, SpeechFileEntry[]>()
      for (const lang of outputLanguages) resultsByLang.set(lang, [])

      await processWithConcurrency(workItems, effectiveConcurrency, async (item) => {
        const provider = resolveProviderForLanguage(item.language, routing)
        const providerModel = resolveSpeechModel(provider, providerConfigs, speechModel)
        const outputFormat = resolveSpeechFormat(provider, config.speech?.format)
        const voice = resolveVoice(provider, item.language, voiceMaps, config.speech?.voice)
        // OpenAI + Gemini both receive resolved instructions (Gemini embeds them in
        // the prompt text); Azure has no instruction channel. Must match stage-runner.ts
        // and tts.ts so the shared TTS cache key (computeSpeechCacheKey) stays consistent.
        const instructions =
          provider === "openai" || provider === "gemini"
            ? resolveInstructions(item.language, instructionsMap)
            : ""
        const ttsSynthesizer = getSynthesizer(provider)
        const entry = await generateSpeechFile({
          textId: item.textId,
          text: item.text,
          language: item.language,
          model: providerModel,
          voice,
          instructions,
          format: outputFormat,
          bookDir: path.join(path.resolve(booksRoot), label),
          cacheDir,
          ttsSynthesizer,
          provider,
        })
        if (entry) resultsByLang.get(item.language)!.push(entry)
        completedItems++
        p.emit({
          type: "step-progress",
          step: "tts",
          message: `${completedItems}/${totalItems}`,
          page: completedItems,
          totalPages: totalItems,
        })
      })

      for (const lang of outputLanguages) {
        const entries = resultsByLang.get(lang)!
        const output: TTSOutput = { entries, generatedAt: new Date().toISOString() }
        storage.putNodeData("tts", lang, output)
      }
    })

    // ── Package stage ───────────────────────────────────────────

    executors.set("package-web", async (p) => {
      if (!options.webAssetsDir) return
      const language = getLanguage(storage, config)
      const outputLanguages = getOutputLanguages(config, language)
      const metadataRow = storage.getLatestNodeData("metadata", "book")
      const bookMetadata = metadataRow?.data as { title?: string | null } | null
      const bookTitle = bookMetadata?.title ?? label
      await packageAdtWeb(storage, {
        bookDir: path.join(path.resolve(booksRoot), label),
        label,
        language,
        outputLanguages,
        title: bookTitle,
        webAssetsDir: options.webAssetsDir,
        applyBodyBackground: config.apply_body_background,
        speechConfig: config.speech,
        fixedLayout: isFixedLayoutBook(config),
        reflowableFont: config.reflowable_font,
      }, progressOnly(p))
    })

    executors.set("accessibility-assessment", async (p) => {
      if (!options.webAssetsDir) return
      const output = await runAccessibilityAssessment({
        bookDir: path.join(path.resolve(booksRoot), label),
        config: config.accessibility_assessment,
      }, progressOnly(p))
      storage.putNodeData("accessibility-assessment", "book", output)
    })

    return await runPipelineDAG(executors, progress)
  } finally {
    storage.close()
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function getLanguage(
  storage: Storage,
  config: ReturnType<typeof loadBookConfig>,
): string {
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as { language_code?: string | null } | null
  return normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")
}

function getOutputLanguages(
  config: ReturnType<typeof loadBookConfig>,
  language: string,
): string[] {
  return Array.from(
    new Set(
      [language, ...(config.output_languages ?? [])].map((code) => normalizeLocale(code))
    )
  )
}
