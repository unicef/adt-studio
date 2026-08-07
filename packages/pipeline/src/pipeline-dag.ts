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
  createElevenLabsTTSSynthesizer,
} from "@adt/llm"
import type { LLMModel, LlmLogEntry, LogLevel, TTSSynthesizer } from "@adt/llm"
import type {
  StepName,
  ImageClassificationOutput,
  PageSectioningOutput,
  BookMetadata,
  BookSummaryOutput,
  GlossaryOutput,
  TextCatalogOutput,
  TextCatalogEntry,
  EasyReadOutput,
  SpeechFileEntry,
  TTSOutput,
  WebRenderingOutput,
} from "@adt/types"
import { isTtsExcluded } from "@adt/types"
import { extractPDF } from "./pdf-extraction.js"
import {
  resolveFontsCacheDir,
  buildBookFontsPromptContext,
  ensureBookGoogleFontsCached,
} from "./fonts-bundle.js"
import { readTypography } from "./typography.js"
import { extractMetadata, buildMetadataConfig } from "./metadata-extraction.js"
import { generateBookSummary, buildBookSummaryConfig } from "./book-summary.js"
import {
  BOOK_OUTLINE_ITEM,
  BOOK_OUTLINE_NODE,
  buildBookOutlineConfig,
  generateBookOutline,
  outlineContextForPage,
  readBookOutline,
} from "./book-outline.js"
import { buildBookOutlineEvidence } from "./book-outline-evidence.js"
import { readTypeScale } from "./type-scale.js"
import { PositionedTextOutput } from "@adt/types"
import {
  sectionPage,
  buildPageSectioningConfig,
} from "./page-sectioning.js"
import { classifyPageImages, buildImageClassifyConfig } from "./image-filtering.js"
import { filterPageImageMeaningfulness, buildMeaningfulnessConfig } from "./image-meaningfulness.js"
import { cropPageImages, applyCrops, buildCroppingConfig, getCroppedImageId } from "./image-cropping.js"
import { segmentPageImages, applySegmentation, segmentBoundsOnPage, buildSegmentationConfig, getSegmentedImageId } from "./image-segmentation.js"
import { renderPage, buildRenderStrategyResolver, collectReferencedImageIds, collectSourcePageImages } from "./web-rendering.js"
import { translatePageTree, buildTranslationConfig } from "./translation.js"
import { createTemplateEngine } from "./render-template.js"
import { captionPageImages, buildCaptionConfig, collectCaptionImageIds, groupGlossaryImageIdsByPage } from "./image-captioning.js"
import { regenerateGlossaryPreservingEdits, buildGlossaryConfig } from "./glossary.js"
import { generateToc, buildTocGenerationConfig } from "./toc-generation.js"
import { generateAllQuizzes, buildQuizGenerationConfig, type QuizPageInput } from "./quiz-generation.js"
import { buildTextCatalog } from "./text-catalog.js"
import { buildEasyReadConfig, buildEasyReadSourceBlocks, createEmptyEasyReadOutput, generateEasyRead, flattenEasyReadEntries, isDeterministicEmptyEasyReadOutput } from "./easy-read.js"
import { translateCatalogBatch, buildCatalogTranslationConfig, getTargetLanguages } from "./catalog-translation.js"
import {
  buildCoreTtsPreparationConfig,
  loadCoreTtsProfiles,
  resolveCoreTtsProfile,
  getCoreTtsPreparationLocales,
  prepareCoreTtsCatalog,
  getCoreTtsCatalog,
  buildCoreTtsSourceContext,
  getReadyCoreTtsEntries,
} from "./core-tts.js"
import { normalizeLocale } from "./language-context.js"
import {
  loadVoicesConfig,
  loadSpeechInstructions,
  resolveVoice,
  resolveInstructions,
  resolveProviderForLanguage,
  resolveSpeechModel,
  resolveSpeechFormat,
  generateSpeechFile,
  findAdjacentSpeechText,
  elevenLabsVoiceSettingsFromConfig,
  classifyElevenLabsTtsError,
  elevenLabsTtsRetryDelayMs,
  ELEVENLABS_TTS_MAX_CONCURRENCY,
  ELEVENLABS_TTS_MAX_RATE_LIMIT_RETRIES,
  type ProviderRouting,
} from "./speech.js"
import { packageAdtWeb } from "./packaging/web.js"
import { processFixedLayoutPages, isFixedLayoutBook } from "./fixed-layout-rendering.js"
import { getRenderSectioning, getSemanticSectioning } from "./render-sectioning.js"
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
  elevenLabsApiKey?: string
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
    const bookOutlineConfig = buildBookOutlineConfig(config)
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
          spreadPairs: config.spread_pairs,
          vectorTextGrouping: config.vector_text_grouping,
          // Gates the positioned-text pipeline (fixed-layout rendering is its
          // only consumer). Must match stage-runner so re-runs are consistent.
          fixedLayout: isFixedLayoutBook(config),
          fontsCacheDir: resolveFontsCacheDir(booksRoot),
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

    executors.set("book-outline", async () => {
      const pages = storage.getPages()
      const evidencePages = pages.map((page) => {
        const positionedRow = storage.getLatestNodeData("positioned-text", page.pageId)
        const positioned = PositionedTextOutput.safeParse(positionedRow?.data)
        return {
          pageId: page.pageId,
          pageNumber: page.pageNumber,
          text: page.text,
          imageBase64: storage.getPageImageBase64(page.pageId),
          ...(positioned.success && { positionedText: positioned.data }),
        }
      })
      const evidence = buildBookOutlineEvidence(evidencePages, readTypeScale(storage))
      const model = getModel(bookOutlineConfig.modelId)
      const result = await generateBookOutline(evidence, bookOutlineConfig, model)
      storage.putNodeData(BOOK_OUTLINE_NODE, BOOK_OUTLINE_ITEM, result)
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
            const srcMeta = new Map(allImages.map((img) => [img.imageId, img]))
            for (const seg of applied) {
              const src = srcMeta.get(seg.sourceImageId)
              const bounds = src?.bounds
                ? segmentBoundsOnPage(src.bounds, src.width, src.height, seg)
                : undefined
              storage.putSegmentedImage({
                sourceImageId: seg.sourceImageId,
                segmentIndex: seg.segmentIndex,
                pageId: page.pageId,
                version: segVersion,
                buffer: seg.buffer,
                width: seg.width,
                height: seg.height,
                bounds,
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
      // Semantic LLM sectioning runs for ALL books (including fixed-layout) so
      // `page-sectioning` always holds the editable semantic tree, the
      // Sectioning view never empties, and the render strategy can be toggled
      // without re-sectioning. Fixed-layout's positioned tree + rendering is
      // produced in the web-rendering step instead (see below).
      const model = getModel(pageSectioningConfig.modelId)
      const pages = storage.getPages()
      const bookOutline = readBookOutline(storage)
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
            outline: outlineContextForPage(bookOutline, page.pageId),
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
      if (isFixedLayout) {
        // Fixed-layout: build the positioned tree (into `fixed-layout-sectioning`)
        // and render from it. Driven off positioned-text + image-filtering; no
        // LLM call. `page-sectioning` (semantic) is left intact.
        const imageUrlPrefix = `/api/books/${label}/images`
        processFixedLayoutPages(storage, imageUrlPrefix)
        p.emit({ type: "step-progress", step: "web-rendering", message: "fixed-layout pages" })
        return
      }

      await ensureBookGoogleFontsCached(storage, resolveFontsCacheDir(booksRoot))

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
      // Resolve once per book — every page shares the same typography.
      const typography = readTypography(storage)
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
        // Sections can reference images extracted on other pages (cross-page
        // merges, images added from another page) — those are not in this
        // page's image-filtering output, so pull them in by walking the tree.
        for (const imageId of collectReferencedImageIds(sectioning.sections)) {
          if (renderImages.has(imageId)) continue
          try {
            const dims = storage.getImageDimensions(imageId)
            renderImages.set(imageId, { base64: storage.getImageBase64(imageId), width: dims?.width ?? undefined, height: dims?.height ?? undefined })
          } catch {
            // Image file no longer exists — leave it out; the renderer emits
            // the URL reference without pixels.
          }
        }
        const pageImageBase64 = storage.getPageImageBase64(page.pageId)
        // Page images for content merged in from other pages (cross-page
        // merges) — per-section provenance recorded in sourcePageIds.
        const sourcePageImages = collectSourcePageImages(
          sectioning.sections,
          (id) => storage.getPageImageBase64(id)
        )
        const result = await renderPage(
          {
            label,
            pageId: page.pageId,
            pageImageBase64,
            sectioning: sectioning,
            images: renderImages,
            sourcePageImages,
            bookFonts: buildBookFontsPromptContext(storage),
            typography,
          },
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
        // Filter by the SEMANTIC sectioning (real section types like
        // `text_and_single_image`), not the render sectioning — in fixed-layout
        // the latter is the positioned tree whose only type is
        // `fixed-layout-page`, which never matches `quiz_section_types`, so no
        // quizzes would ever generate.
        const sectioning = getSemanticSectioning(storage, page.pageId)
        if (!renderingRow || !sectioning) continue
        quizPages.push({
          pageId: page.pageId,
          rendering: renderingRow.data as WebRenderingOutput,
          sectioning,
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
      const glossaryRow = storage.getLatestNodeData("glossary", "book")
      const glossary = glossaryRow?.data as GlossaryOutput | undefined
      const glossaryImageIdsByPage = groupGlossaryImageIdsByPage(
        glossary,
        (imageId) => storage.getImageMeta(imageId)?.pageId,
      )
      const pages = storage.getPages()
      const totalPages = pages.length
      let completed = 0
      await processWithConcurrency(pages, effectiveConcurrency, async (page) => {
        const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
        if (!renderingRow) return
        const rendering = renderingRow.data as WebRenderingOutput
        const sectioning = getRenderSectioning(storage, page.pageId)
        const htmlSections = rendering.sections
          .filter((s) => !sectioning?.sections[s.sectionIndex]?.isPruned)
          .map((s) => s.html)
        const imageIds = collectCaptionImageIds(
          htmlSections,
          glossaryImageIdsByPage.get(page.pageId),
        )
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

      const glossary = await regenerateGlossaryPreservingEdits({
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

    executors.set("core-tts-catalog", async (p) => {
      const language = getLanguage(storage, config)
      const outputLanguages = getOutputLanguages(config, language)
      const catalogRow = storage.getLatestNodeData("text-catalog", "book")
      if (!catalogRow) return
      const catalog = catalogRow.data as TextCatalogOutput
      const easyReadRow = storage.getLatestNodeData("easy-read", "book")
      const easyReadEntries = flattenEasyReadEntries(
        easyReadRow?.data as EasyReadOutput | undefined,
      )
      const sourceDisplayEntries = [...catalog.entries, ...easyReadEntries]
      if (sourceDisplayEntries.length === 0) return

      const preparationConfig = buildCoreTtsPreparationConfig(config)
      const model = getModel(preparationConfig.modelId)
      const profiles = loadCoreTtsProfiles(
        options.configDir ?? path.resolve(process.cwd(), "config"),
      )
      const sourceCatalog = await prepareCoreTtsCatalog({
        entries: sourceDisplayEntries,
        language,
        config: preparationConfig,
        profile: resolveCoreTtsProfile(language, profiles),
        llmModel: model,
        previous: getCoreTtsCatalog(storage, language),
      })
      storage.putNodeData("core-tts-catalog", language, sourceCatalog)
      const sourceContext = buildCoreTtsSourceContext(
        sourceDisplayEntries,
        sourceCatalog,
      )

      const preparationLocales = getCoreTtsPreparationLocales(
        outputLanguages,
        language,
      )
      let completed = 1
      for (const locale of preparationLocales) {
        const lang = locale.language
        let displayEntries = sourceDisplayEntries
        if (!locale.usesSourceDisplayText) {
          const legacy = lang.replace("-", "_")
          const row =
            storage.getLatestNodeData("text-catalog-translation", lang) ??
            storage.getLatestNodeData("text-catalog-translation", legacy)
          if (!row) continue
          displayEntries = (row.data as TextCatalogOutput).entries
        }
        const targetCatalog = await prepareCoreTtsCatalog({
          entries: displayEntries,
          language: lang,
          config: preparationConfig,
          profile: resolveCoreTtsProfile(lang, profiles),
          llmModel: model,
          previous: getCoreTtsCatalog(storage, lang),
          sourceContext,
        })
        storage.putNodeData("core-tts-catalog", lang, targetCatalog)
        completed++
        p.emit({
          type: "step-progress",
          step: "core-tts-catalog",
          message: `${completed}/${outputLanguages.length} languages`,
          page: completed,
          totalPages: outputLanguages.length,
        })
      }
    })

    executors.set("tts", async (p) => {
      const language = getLanguage(storage, config)
      const outputLanguages = getOutputLanguages(config, language)
      if (!outputLanguages.some((lang) => getReadyCoreTtsEntries(storage, lang).length > 0)) return

      const configDir = options.configDir ?? path.resolve(process.cwd(), "config")
      const azureConfig = options.azureSpeechKey && options.azureSpeechRegion
        ? { subscriptionKey: options.azureSpeechKey, region: options.azureSpeechRegion }
        : undefined
      const geminiConfig = options.geminiApiKey
        ? { apiKey: options.geminiApiKey }
        : undefined
      const elevenLabsConfig = options.elevenLabsApiKey
        ? { apiKey: options.elevenLabsApiKey }
        : undefined
      const voiceMaps = loadVoicesConfig(configDir)
      const instructionsMap = loadSpeechInstructions(configDir)
      const speechModel =
        config.speech?.model ?? config.default_speech_generation_model
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
        if (providerName === "elevenlabs") {
          if (!elevenLabsConfig && !process.env.ELEVENLABS_API_KEY) {
            throw new Error("ELEVENLABS_API_KEY is required for ElevenLabs TTS provider")
          }
          const synth = createElevenLabsTTSSynthesizer(elevenLabsConfig, {
            sampleRate: config.speech?.sample_rate,
            bitRate: config.speech?.bit_rate,
          })
          synthesizers.set("elevenlabs", synth)
          return synth
        }
        const synth = createTTSSynthesizer()
        synthesizers.set(providerName, synth)
        return synth
      }

      interface TTSWorkItem { textId: string; text: string; language: string; previousText?: string; nextText?: string }
      const workItems: TTSWorkItem[] = []
      const resultsByLang = new Map<string, SpeechFileEntry[]>()
      for (const lang of outputLanguages) resultsByLang.set(lang, [])
      for (const lang of outputLanguages) {
        const entries = getReadyCoreTtsEntries(storage, lang)
        const provider = resolveProviderForLanguage(lang, routing)
        const legacyLang = lang.replace("-", "_")
        const existingRow =
          storage.getLatestNodeData("tts", lang) ??
          storage.getLatestNodeData("tts", legacyLang)
        const existingById = new Map(
          ((existingRow?.data as TTSOutput | undefined)?.entries ?? []).map(
            (entry) => [entry.textId, entry],
          ),
        )
        for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
          const entry = entries[entryIndex]
          if (isTtsExcluded(entry.id, config.speech)) continue
          const existing = existingById.get(entry.id)
          if (existing?.provider === "manual") {
            const normalizedPath = path.join(
              path.resolve(booksRoot),
              label,
              "audio",
              lang,
              existing.fileName,
            )
            const legacyPath = path.join(
              path.resolve(booksRoot),
              label,
              "audio",
              legacyLang,
              existing.fileName,
            )
            if (fs.existsSync(normalizedPath) || fs.existsSync(legacyPath)) {
              resultsByLang.get(lang)!.push(existing)
              continue
            }
          }
          // ElevenLabs-only: adjacent-entry context, opt-in via
          // elevenlabs_use_context. Must resolve identically to stage-runner.ts
          // so the shared cache key (computeSpeechCacheKey) stays in sync.
          const previousText =
            provider === "elevenlabs" && config.speech?.elevenlabs_use_context
              ? findAdjacentSpeechText(entries, entryIndex, -1, config.speech)
              : undefined
          const nextText =
            provider === "elevenlabs" && config.speech?.elevenlabs_use_context
              ? findAdjacentSpeechText(entries, entryIndex, 1, config.speech)
              : undefined
          workItems.push({ textId: entry.id, text: entry.text, language: lang, previousText, nextText })
        }
      }

      const totalItems = workItems.length
      let completedItems = 0

      const elevenLabsVoiceSettings = elevenLabsVoiceSettingsFromConfig(config.speech)

      const runTtsItem = async (item: TTSWorkItem) => {
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
        const generate = () =>
          generateSpeechFile({
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
            geminiTemperature: config.speech?.temperature,
            geminiSeed: config.speech?.seed,
            elevenLabsPreviousText: item.previousText,
            elevenLabsNextText: item.nextText,
            elevenLabsApplyTextNormalization: config.speech?.elevenlabs_apply_text_normalization,
            ...elevenLabsVoiceSettings,
          })

        // ElevenLabs throttles on concurrent requests, so a burst returns 429s
        // that would otherwise fail the entry outright. Retry 429/5xx with the
        // same backoff the API stage-runner uses.
        let entry: Awaited<ReturnType<typeof generateSpeechFile>>
        if (provider === "elevenlabs") {
          for (let attemptCount = 1; ; attemptCount++) {
            try {
              entry = await generate()
              break
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              if (
                classifyElevenLabsTtsError(message) === "permanent" ||
                attemptCount > ELEVENLABS_TTS_MAX_RATE_LIMIT_RETRIES
              ) {
                throw err
              }
              const delayMs = elevenLabsTtsRetryDelayMs(attemptCount)
              console.warn(
                `[pipeline] ElevenLabs TTS failed for ${item.textId} (${item.language}); retrying ${attemptCount + 1}/${ELEVENLABS_TTS_MAX_RATE_LIMIT_RETRIES + 1} in ${delayMs}ms: ${message}`
              )
              await new Promise((resolve) => setTimeout(resolve, delayMs))
            }
          }
        } else {
          entry = await generate()
        }

        if (entry) resultsByLang.get(item.language)!.push(entry)
        completedItems++
        p.emit({
          type: "step-progress",
          step: "tts",
          message: `${completedItems}/${totalItems}`,
          page: completedItems,
          totalPages: totalItems,
        })
      }

      // ElevenLabs plans cap *concurrent* requests (Free ~4, Starter ~5), far
      // below the default concurrency of 32, so its items run in their own
      // capped pass. Everything else keeps full concurrency — the two passes run
      // together so a mixed book doesn't throttle its non-ElevenLabs languages.
      const elevenLabsItems = workItems.filter(
        (item) => resolveProviderForLanguage(item.language, routing) === "elevenlabs"
      )
      const otherItems = workItems.filter(
        (item) => resolveProviderForLanguage(item.language, routing) !== "elevenlabs"
      )
      await Promise.all([
        processWithConcurrency(otherItems, effectiveConcurrency, runTtsItem),
        processWithConcurrency(
          elevenLabsItems,
          Math.min(ELEVENLABS_TTS_MAX_CONCURRENCY, effectiveConcurrency),
          runTtsItem
        ),
      ])

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
        quizMatchBookStyle: config.quiz_generation?.match_book_style ?? true,
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
