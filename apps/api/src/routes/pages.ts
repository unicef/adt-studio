import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import {
  parseBookLabel,
  ImageClassificationOutput,
  PageSectioningOutput,
  WebRenderingOutput,
  ImageCaptioningOutput,
  ImageSegmentRegion,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_LLM_MAX_RETRIES,
  primaryFontFamily,
  reflowableFontChain,
  BookFontRegistry,
  bookBodyFont,
  bookFontFamilyChain,
  splitNodesBefore,
  IMAGE_SET_CHANGE_CLEAR_NODE_TYPES,
  IMAGE_SET_CHANGE_CLEAR_STEPS,
  PIPELINE,
  getStageClearOrder,
  getStageDependents,
  EDITABLE_ACTIVITY_NODE,
  CoreTtsCatalogOutput,
  TextCatalogOutput,
  type TTSOutput,
  type WordTimestampOutput,
} from "@adt/types"
import type { ContentNodeData, ExtractionWarning } from "@adt/types"
import { classifyExtractionWarning, flattenVisibleSectioningText } from "../services/extraction-warning.js"
import { openBookDb } from "@adt/storage"
import { createBookStorage } from "@adt/storage"
import { readCurrentNodeRow, CURRENT_VERSION_ORDER } from "@adt/storage"
import type { Storage } from "@adt/storage"
import {
  detectSpreads,
  type SpreadEdgeSample,
  classifyPageImages,
  buildImageClassifyConfig,
  deduplicateAutoFigureCandidates,
  figureExtractionFlags,
  readEditableActivities,
  remapEditableActivities,
  invalidateCoreTtsForDisplayEntries,
  resolveFigureExtractionMode,
} from "@adt/pipeline"
import { samplePageEdges, extractPages, computeGroups, countPdfPages } from "@adt/pdf"
import { reRenderPage, aiEditSection } from "../services/page-edit-service.js"
import {
  getBookStyleguidesDir,
  getGeneratedStyleguideName,
  StyleguideWriteError,
  writeStyleguideFiles,
} from "../services/styleguide.js"
import type { TaskService } from "../services/task-service.js"
import {
  segmentPageImages,
  getSegmentedImageId,
  segmentBoundsOnPage,
  loadBookConfig,
  applyCrop,
  generateStyleguide,
  buildBookFontsPromptContext,
  readTypography,
  resolveTypographyCss,
  buildStyleguideGenerationConfig,
  buildScreenshotHtml,
  createScreenshotRenderer,
  SCREENSHOT_VIEWPORTS,
  isFixedLayoutBook,
  type ScreenshotRenderer,
} from "@adt/pipeline"
import { createLLMModel, createPromptEngine, renderLiquidTemplate, generateImageWithCache } from "@adt/llm"

/**
 * Lazily-initialized shared Playwright renderer for section screenshots.
 * Launching Chromium is slow (~500ms-1s) so we keep one instance alive for
 * the API process lifetime. Concurrent requests share the same browser; each
 * screenshot call opens its own browser context inside it.
 */
let sharedScreenshotRendererPromise: Promise<ScreenshotRenderer> | null = null
function getSharedScreenshotRenderer(): Promise<ScreenshotRenderer> {
  if (!sharedScreenshotRendererPromise) {
    sharedScreenshotRendererPromise = createScreenshotRenderer().catch((err) => {
      // Reset on failure so the next request can retry.
      sharedScreenshotRendererPromise = null
      throw err
    })
  }
  return sharedScreenshotRendererPromise
}

interface PageSummarySection {
  sectionId: string
  sectionIndex: number
  sectionType: string
  isActivity: boolean
  isPruned: boolean
  textPreview: string
}

interface PageSummary {
  pageId: string
  pageNumber: number
  hasRendering: boolean
  hasCaptioning: boolean
  textPreview: string
  imageCount: number
  wordCount: number
  sectionCount: number
  prunedSections: number[]
  renderingVersion: number | null
  sectioningVersion: number | null
  sections: PageSummarySection[]
  /** `text-layer-missing` when the page's embedded text layer was empty but the
   *  Sectioning step (vision) recovered text from the page image (a scanned /
   *  image-only page); null otherwise. */
  extractionWarning: ExtractionWarning | null
}

interface PageDetail {
  pageId: string
  pageNumber: number
  text: string
  sectioningTree: unknown | null
  imageClassification: unknown | null
  imageCropping: unknown | null
  rendering: unknown | null
  imageCaptioning: unknown | null
  /** Per-image metadata for this page (dimensions, optional PDF-point placement bounds). */
  imagesMeta: Array<{
    imageId: string
    width: number
    height: number
    bounds?: { x: number; y: number; width: number; height: number }
  }>
  /** Distinct fonts the extractor found on this page (from positioned text),
   *  each with the rounded sizes (px) it appears at. Empty for reflowable
   *  books, which don't extract positioned text. */
  fonts: Array<{ family: string; sizes: number[] }>
  /** Book-level detected font category (serif vs sans, char-weighted) used to
   *  pick the reflowable base font. Same for every page; null when the book has
   *  no extractable text. */
  fontProfile: { category: "serif" | "sans" | null; serifChars: number; sansChars: number } | null
  /** Resolved reflowable base-font CSS chain (e.g. `'Atkinson
   *  Hyperlegible','Merriweather',sans-serif`), already gated: null for
   *  fixed-layout books and for the Merriweather default (no override needed).
   *  Mirrors what packaging/preview inject, so the storyboard preview can match. */
  reflowableFontFamily: string | null
  /** `text-layer-missing` when the page's embedded text layer was empty but the
   *  Sectioning step (vision) recovered text from the page image (a scanned /
   *  image-only page); null otherwise. */
  extractionWarning: ExtractionWarning | null
  versions: {
    sectioning: number | null
    imageClassification: number | null
    imageCropping: number | null
    rendering: number | null
    imageCaptioning: number | null
  }
}

/**
 * Summarize the fonts used on a page from its stored positioned-text node:
 * the distinct primary families, each with the rounded px sizes it appears
 * at. Defensive against shape drift (older/missing data) — returns [] rather
 * than throwing. Sorted by family for stable display.
 */
function derivePageFonts(data: unknown): PageDetail["fonts"] {
  const drawItems = (data as { drawItems?: unknown } | null)?.drawItems
  if (!Array.isArray(drawItems)) return []
  const sizesByFamily = new Map<string, Set<number>>()
  for (const item of drawItems) {
    const segments = (item as { segments?: unknown })?.segments
    if (!Array.isArray(segments)) continue
    for (const seg of segments) {
      const style = (seg as { style?: Record<string, string> })?.style
      if (!style) continue
      const family = primaryFontFamily(style["font-family"] ?? "")
      if (!family) continue
      const size = parseFloat(style["font-size"] ?? "")
      const sizes = sizesByFamily.get(family) ?? new Set<number>()
      if (Number.isFinite(size)) sizes.add(Math.round(size))
      sizesByFamily.set(family, sizes)
    }
  }
  return [...sizesByFamily.entries()]
    .map(([family, sizes]) => ({ family, sizes: [...sizes].sort((a, b) => a - b) }))
    .sort((a, b) => a.family.localeCompare(b.family))
}

function getDbPath(label: string, booksDir: string): string {
  const safeLabel = parseBookLabel(label)
  return path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)
}

/** Validate that an image/page ID is filesystem-safe (no path traversal). */
function validateImageId(id: string): string {
  if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new HTTPException(400, { message: `Invalid image ID: ${id}` })
  }
  return id
}

function imageFileExtension(mimeType: string | undefined): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg"
    case "image/webp":
      return "webp"
    default:
      return "png"
  }
}

interface AiImageGenParams {
  safeLabel: string
  bookDir: string
  dbPath: string
  apiKey: string
  pageId: string
  prompt: string
  referenceImageId?: string
  targetImageId?: string
  style?: string
  imageType?: string
  styleImageId?: string
  promptsDir: string
  /** Section index for auto-saving updated sectioning/rendering */
  sectionIndex?: number
  /** "swap" replaces targetImageId, "add" appends to section */
  mode?: "swap" | "add"
  booksDir: string
  modelId: string
}

async function executeAiImageGeneration(params: AiImageGenParams): Promise<{
  imageId: string; width: number; height: number; originalWidth: number; originalHeight: number
}> {
  const {
    bookDir, dbPath, apiKey, pageId, prompt,
    referenceImageId, targetImageId, style, imageType, styleImageId, promptsDir,
    modelId,
  } = params

  // Choose the correct prompt template: edit vs generate
  const isEditMode = !!referenceImageId
  const promptName = isEditMode ? "ai_image_edit" : "ai_image_generation"
  const bookPromptPath = path.join(bookDir, "prompts", `${promptName}.liquid`)
  const globalPromptPath = path.join(path.resolve(promptsDir), `${promptName}.liquid`)
  let templateContent: string | null = null
  if (fs.existsSync(bookPromptPath)) {
    templateContent = fs.readFileSync(bookPromptPath, "utf-8")
  } else if (fs.existsSync(globalPromptPath)) {
    templateContent = fs.readFileSync(globalPromptPath, "utf-8")
  }
  let finalPrompt: string
  if (templateContent) {
    finalPrompt = await renderLiquidTemplate(templateContent.trim(), {
      user_prompt: prompt,
      style: style || null,
      image_type: imageType || null,
    })
  } else {
    finalPrompt = prompt
  }

  // Look up target image dimensions
  let originalWidth = 0
  let originalHeight = 0
  let referenceImagePath: string | undefined
  let styleImagePath: string | undefined
  if (targetImageId || referenceImageId || styleImageId) {
    const db0 = openBookDb(dbPath)
    try {
      if (targetImageId) {
        const row = db0.get(
          "SELECT width, height FROM images WHERE image_id = ?",
          [targetImageId]
        ) as { width: number; height: number } | undefined
        if (row) {
          originalWidth = row.width
          originalHeight = row.height
        }
      }
      if (referenceImageId) {
        const row = db0.get(
          "SELECT path FROM images WHERE image_id = ?",
          [referenceImageId]
        ) as { path: string } | undefined
        if (row) referenceImagePath = path.join(bookDir, row.path)
      }
      if (styleImageId) {
        const row = db0.get(
          "SELECT path FROM images WHERE image_id = ?",
          [styleImageId]
        ) as { path: string } | undefined
        if (row) styleImagePath = path.join(bookDir, row.path)
      }
    } finally {
      db0.close()
    }
  }

  // Pick size that best matches the original aspect ratio
  let size = "1024x1024"
  if (originalWidth > 0 && originalHeight > 0) {
    const ratio = originalWidth / originalHeight
    if (ratio > 1.2) size = "1536x1024"
    else if (ratio < 0.8) size = "1024x1536"
  }

  const referenceImages: Array<{ data: Buffer; name: string }> = []
  if (referenceImagePath && fs.existsSync(referenceImagePath)) {
    referenceImages.push({
      data: fs.readFileSync(referenceImagePath),
      name: `${referenceImageId}.png`,
    })
  }
  if (styleImagePath && fs.existsSync(styleImagePath)) {
    referenceImages.push({
      data: fs.readFileSync(styleImagePath),
      name: `${styleImageId}.png`,
    })
  }

  const logStorage = createBookStorage(params.safeLabel, params.booksDir)
  let generated: Awaited<ReturnType<typeof generateImageWithCache>>
  try {
    generated = await generateImageWithCache({
      apiKey,
      modelId,
      prompt: finalPrompt,
      size: size as `${number}x${number}`,
      referenceImages,
      cacheDir: path.join(bookDir, ".cache"),
      timeoutMs: 180_000,
      log: {
        taskType: "image-generation",
        pageId,
        promptName: referenceImageId ? "ai-image-edit" : "ai-image-generate",
      },
      onLog: (entry) => logStorage.appendLlmLog(entry),
    })
  } finally {
    logStorage.close()
  }

  const buffer = Buffer.from(generated.base64, "base64")
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16)

  const [widthStr, heightStr] = size.split("x")
  const width = parseInt(widthStr, 10) || 1024
  const height = parseInt(heightStr, 10) || 1024

  if (originalWidth === 0) originalWidth = width
  if (originalHeight === 0) originalHeight = height

  const db = openBookDb(dbPath)
  try {
    const prefix = referenceImageId ?? pageId
    const existing = db.all(
      "SELECT image_id FROM images WHERE image_id LIKE ?",
      [`${prefix}_ai%`]
    ) as Array<{ image_id: string }>
    let maxN = 0
    for (const row of existing) {
      const m = row.image_id.match(/_ai(\d+)$/)
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
    }
    const newImageId = `${prefix}_ai${maxN + 1}`

    const extension = imageFileExtension(generated.mimeType)
    const filename = `${newImageId}.${extension}`
    const imagesDir = path.join(bookDir, "images")
    fs.mkdirSync(imagesDir, { recursive: true })
    fs.writeFileSync(path.join(imagesDir, filename), buffer)

    db.run(
      `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (image_id) DO UPDATE SET
         page_id = excluded.page_id,
         path = excluded.path,
         hash = excluded.hash,
         width = excluded.width,
         height = excluded.height,
         source = excluded.source`,
      [newImageId, pageId, `images/${filename}`, hash, width, height, "crop"]
    )

    // Auto-save: update rendering HTML with the new image
    if (params.sectionIndex !== undefined && params.mode) {
      try {
        const storage = createBookStorage(params.safeLabel, params.booksDir)
        try {
          const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
          if (renderingRow) {
            const parsed = WebRenderingOutput.safeParse(renderingRow.data)
            if (parsed.success) {
              const rendering = parsed.data
              const si = params.sectionIndex
              const urlPrefix = `/api/books/${params.safeLabel}/images`
              rendering.sections = rendering.sections.map((s) => {
                if (s.sectionIndex !== si) return s
                let html = s.html
                if (params.mode === "swap" && params.targetImageId) {
                  const tid = params.targetImageId
                  html = html.replace(new RegExp(`data-id="${tid}"`, "g"), `data-id="${newImageId}"`)
                  html = html.replace(new RegExp(`${urlPrefix}/${tid}`, "g"), `${urlPrefix}/${newImageId}`)
                  const escaped = newImageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                  html = html.replace(
                    new RegExp(`(<img[^>]*data-id="${escaped}"[^>]*?)(/?>)`, "g"),
                    (_, before, close) => {
                      let tag = before as string
                      tag = tag.replace(/\s+width="[^"]*"/, "")
                      tag = tag.replace(/\s+height="[^"]*"/, "")
                      return `${tag} width="${originalWidth}" height="${originalHeight}"${close}`
                    }
                  )
                } else if (params.mode === "add") {
                  const imgTag = `<img data-id="${newImageId}" src="${urlPrefix}/${newImageId}" width="${width}" height="${height}" alt="${newImageId}" class="w-full" />`
                  const closingIdx = html.lastIndexOf("</section>")
                  html = closingIdx >= 0
                    ? html.slice(0, closingIdx) + imgTag + html.slice(closingIdx)
                    : html + imgTag
                }
                return { ...s, html }
              })
              saveStoryboardNode(storage, "web-rendering", pageId, rendering)
            }
          }
        } finally {
          storage.close()
        }
      } catch (err) {
        console.error("[ai-image] Auto-save rendering failed:", err)
      }
    }

    return { imageId: newImageId, width, height, originalWidth, originalHeight }
  } finally {
    db.close()
  }
}

/** Clear storyboard-dependent data when page text, rendering, or images change. */
function clearCaptionData(storage: Storage): void {
  storage.clearNodesByType([...IMAGE_SET_CHANGE_CLEAR_NODE_TYPES])
  storage.clearStepRuns([...IMAGE_SET_CHANGE_CLEAR_STEPS])
}

const RestorableNode = z.enum([
  "toc-generation",
  "glossary",
  "quiz-generation",
  "text-catalog-translation",
  "core-tts-catalog",
  "easy-read",
  "image-filtering",
  "image-captioning",
  "page-sectioning",
  "web-rendering",
])
type RestorableNode = z.infer<typeof RestorableNode>

/**
 * Invalidate outputs derived from a restored entity. A pointer move is still a
 * data mutation: keeping outputs generated from the abandoned version would
 * leave the book in a mixed state. The policies follow each node's actual
 * catalog, translation, speech, and packaging dependencies.
 */
function clearRestoredNodeDependents(
  storage: Storage,
  node: RestorableNode,
  itemId: string,
  previousData?: unknown,
): void {
  switch (node) {
    case "image-filtering":
    case "page-sectioning":
    case "web-rendering":
      clearCaptionData(storage)
      return

    case "image-captioning":
    case "glossary":
    case "quiz-generation":
      storage.clearNodesByType([
        "text-catalog",
        "text-catalog-translation",
        "core-tts-catalog",
        "tts",
        "tts-timestamps",
        "accessibility-assessment",
      ])
      storage.clearStepRuns([
        "text-catalog",
        "catalog-translation",
        "core-tts-catalog",
        "image-translation",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ])
      return

    case "easy-read":
      storage.clearNodesByType([
        "text-catalog-translation",
        "core-tts-catalog",
        "tts",
        "tts-timestamps",
        "accessibility-assessment",
      ])
      storage.clearStepRuns([
        "catalog-translation",
        "core-tts-catalog",
        "image-translation",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ])
      return

    case "text-catalog-translation": {
      const restored = TextCatalogOutput.safeParse(
        storage.getLatestNodeData("text-catalog-translation", itemId)?.data,
      )
      if (restored.success) {
        invalidateCoreTtsForDisplayEntries({
          storage,
          language: itemId,
          entries: restored.data.entries,
        })
      }
      storage.clearNodesByType(["accessibility-assessment"])
      storage.clearStepRuns([
        "core-tts-catalog",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ])
      return
    }

    case "core-tts-catalog": {
      const previous = CoreTtsCatalogOutput.safeParse(previousData)
      const restored = CoreTtsCatalogOutput.safeParse(
        storage.getLatestNodeData("core-tts-catalog", itemId)?.data,
      )
      const previousById = new Map(
        (previous.success ? previous.data.entries : []).map((entry) => [entry.id, entry]),
      )
      const restoredById = new Map(
        (restored.success ? restored.data.entries : []).map((entry) => [entry.id, entry]),
      )
      const changedIds = new Set(
        [...new Set([...previousById.keys(), ...restoredById.keys()])].filter((id) => {
          const before = previousById.get(id)
          const after = restoredById.get(id)
          return before?.speechText !== after?.speechText || before?.status !== after?.status
        }),
      )
      const legacyItemId = itemId.replace("-", "_")
      const normalizedTts = storage.getLatestNodeData("tts", itemId)
      const ttsRow = normalizedTts ?? storage.getLatestNodeData("tts", legacyItemId)
      if (ttsRow && changedIds.size > 0) {
        const tts = ttsRow.data as TTSOutput
        storage.putNodeData("tts", normalizedTts ? itemId : legacyItemId, {
          ...tts,
          entries: tts.entries.filter(
            (entry) => entry.provider === "manual" || !changedIds.has(entry.textId),
          ),
          failed: tts.failed?.filter((entry) => !changedIds.has(entry.textId)),
          generatedAt: new Date().toISOString(),
        } satisfies TTSOutput)
      }
      const normalizedTimestamps = storage.getLatestNodeData("tts-timestamps", itemId)
      const timestampRow =
        normalizedTimestamps ??
        storage.getLatestNodeData("tts-timestamps", legacyItemId)
      if (timestampRow && changedIds.size > 0) {
        const timestamps = timestampRow.data as WordTimestampOutput
        const entries = Object.fromEntries(
          Object.entries(timestamps.entries).filter(([id]) => !changedIds.has(id)),
        )
        storage.putNodeData(
          "tts-timestamps",
          normalizedTimestamps ? itemId : legacyItemId,
          {
            ...timestamps,
            entries,
            failed: timestamps.failed?.filter((entry) => !changedIds.has(entry.textId)),
            generatedAt: new Date().toISOString(),
          } satisfies WordTimestampOutput,
        )
      }
      storage.clearNodesByType(["accessibility-assessment"])
      storage.clearStepRuns([
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ])
      return
    }

    case "toc-generation":
      storage.clearNodesByType(["accessibility-assessment"])
      storage.clearStepRuns(["package-web", "accessibility-assessment"])
  }
}

/**
 * Mark the storyboard chain as needing a re-run, without deleting any node data.
 *
 * A sectioning edit invalidates the storyboard's rendered HTML, and every later
 * output (text catalog, translations, audio, the packaged book) is re-derived
 * from that HTML — so leaving those stages marked "done" would silently ship the
 * old text. We clear only `step_runs`: the renderings and their version history
 * survive (so manual storyboard edits elsewhere in the book are not destroyed)
 * and are overwritten only when the user actually re-runs.
 *
 * `includeStoryboard: false` keeps the storyboard's own step run, for the case
 * where the caller wrote a matching `web-rendering` in the same save: the HTML
 * on disk already reflects the new sectioning, so only the stages *derived* from
 * it are behind. Marking storyboard stale there would be a lie that also costs
 * the user their editor — the Storyboard view is gated on the stage status.
 */
function markStoryboardChainStale(
  storage: Storage,
  { includeStoryboard = true }: { includeStoryboard?: boolean } = {}
): void {
  const stages = new Set<string>(
    includeStoryboard ? getStageClearOrder("storyboard") : getStageDependents("storyboard")
  )
  storage.clearStepRuns(
    PIPELINE.filter((stage) => stages.has(stage.name)).flatMap((stage) =>
      stage.steps.map((step) => step.name)
    )
  )
}

/**
 * A running pipeline step can commit node data and mark itself complete after a
 * manual Sectioning mutation. Refuse the mutation instead of letting that stale
 * completion resurrect the downstream chain as "done".
 */
function assertNoActivePipelineRun(storage: Storage): void {
  const runningSteps = storage
    .getStepRuns()
    .filter((run) => run.status === "running")
    .map((run) => run.step)
  if (runningSteps.length === 0) return

  throw new HTTPException(409, {
    message: `Cannot change sectioning while pipeline steps are running: ${runningSteps.join(", ")}. Wait for the run to finish or cancel it first.`,
  })
}

/**
 * Save storyboard (web-rendering) node data and clear stale downstream data.
 * Use for all user-initiated storyboard saves (NOT pipeline stage runs).
 */
function saveStoryboardNode(
  storage: Storage,
  node: "page-sectioning" | "web-rendering",
  itemId: string,
  data: unknown,
  { renderingInSync = false }: { renderingInSync?: boolean } = {}
): number {
  if (node === "page-sectioning") assertNoActivePipelineRun(storage)
  const version = storage.putNodeData(node, itemId, data)
  clearCaptionData(storage)
  // A sectioning change invalidates the storyboard's rendered HTML — and the
  // structural ops go further: a split drops both halves' HTML and a cross-page
  // merge empties both pages, so those sections would silently vanish from the
  // packaged book while the stage still read "done". A `web-rendering` save is
  // itself the storyboard's output, so it must NOT mark storyboard stale.
  //
  // `renderingInSync` is the Storyboard editor saving a per-section edit whose
  // HTML it has already mirrored, or has queued a targeted re-render for. The
  // storyboard is current (or seconds from it) and only its dependents are
  // behind, so resetting the stage would take the editor away for nothing.
  if (node === "page-sectioning") {
    markStoryboardChainStale(storage, { includeStoryboard: !renderingInSync })
  }
  return version
}

/**
 * Editable (step-by-step) activities are keyed by sectionIndex, so every
 * operation that renumbers sections must remap that map in lockstep — a stale
 * key would attach one section's steps to whatever section occupies the index
 * afterwards. `mapIndex` mirrors the operation's index shift (null = drop the
 * entry: its section was removed or its content changed). `cloneIndex`
 * additionally copies the entry at that original index to `cloneIndex + 1`
 * (section clone). Writes a new version only when something actually changed.
 */
function migrateEditableActivities(
  storage: Storage,
  pageId: string,
  opts: { mapIndex: (index: number) => number | null; cloneIndex?: number }
): number | null {
  const row = readEditableActivities(storage, pageId)
  if (!row) return null
  const remapped = remapEditableActivities(row.activities, opts.mapIndex)
  let activities = remapped ?? row.activities
  let changed = remapped !== null
  if (opts.cloneIndex !== undefined) {
    const source = row.activities[String(opts.cloneIndex)]
    if (source) {
      activities = { ...activities, [String(opts.cloneIndex + 1)]: structuredClone(source) }
      changed = true
    }
  }
  if (!changed) return null
  return storage.putNodeData(EDITABLE_ACTIVITY_NODE, pageId, { activities })
}

/** Renumber sectionIds to the canonical `${pageId}_sec${NNN}` sequence. */
function renumberSectionIds(
  sections: Array<{ sectionId: string }>,
  pageId: string
): void {
  for (let i = 0; i < sections.length; i++) {
    sections[i].sectionId = `${pageId}_sec${String(i + 1).padStart(3, "0")}`
  }
}

/** Point each rendering entry's data-section-id at its (re)numbered section. */
function rewriteRenderingSectionIds(
  entries: Array<{ sectionIndex: number; html: string }>,
  sections: Array<{ sectionId: string }>
): void {
  for (const rs of entries) {
    if (rs.sectionIndex < 0 || rs.sectionIndex >= sections.length) {
      throw new HTTPException(400, { message: "Rendering contains invalid section indexes" })
    }
    const expectedId = sections[rs.sectionIndex]?.sectionId
    if (!expectedId) {
      throw new HTTPException(400, { message: "Unable to map rendering section to sectionId" })
    }
    rs.html = rs.html.replace(
      /data-section-id="[^"]*"/,
      `data-section-id="${expectedId}"`
    )
  }
}

function createNodeIdFactory(
  pageId: string,
  sections: Array<{ nodes: ContentNodeData[] }>
): () => string {
  const usedIds = new Set<string>()
  const collect = (nodes: ContentNodeData[]): void => {
    for (const node of nodes) {
      usedIds.add(node.nodeId)
      if (node.children) collect(node.children)
    }
  }
  for (const section of sections) collect(section.nodes)

  let counter = 1
  return () => {
    let nextId = `${pageId}_n${String(counter).padStart(4, "0")}`
    while (usedIds.has(nextId)) {
      counter += 1
      nextId = `${pageId}_n${String(counter).padStart(4, "0")}`
    }
    usedIds.add(nextId)
    counter += 1
    return nextId
  }
}

function cloneNodesWithFreshContainerIds(
  nodes: ContentNodeData[],
  createId: () => string,
  containerIdMap: Map<string, string>
): ContentNodeData[] {
  return nodes.map((node) => {
    if (node.role) {
      return {
        ...node,
        ...(node.children
          ? { children: cloneNodesWithFreshContainerIds(node.children, createId, containerIdMap) }
          : {}),
      }
    }

    const nextId = createId()
    containerIdMap.set(node.nodeId, nextId)
    return {
      ...node,
      nodeId: nextId,
      children: cloneNodesWithFreshContainerIds(node.children ?? [], createId, containerIdMap),
    }
  })
}

function rewriteContainerIdsInHtml(
  html: string,
  containerIdMap: Map<string, string>
): string {
  let nextHtml = html
  for (const [oldId, newId] of containerIdMap) {
    nextHtml = nextHtml.split(`data-id="${oldId}"`).join(`data-id="${newId}"`)
  }
  return nextHtml
}

export function createPageRoutes(
  booksDir: string,
  promptsDir: string,
  webAssetsDir: string,
  configPath?: string,
  taskService?: TaskService
): Hono {
  const app = new Hono()

  // GET /books/:label/pages — List pages with pipeline status
  app.get("/books/:label/pages", (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = getDbPath(safeLabel, booksDir)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found or not yet extracted: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      const pages = db.all(
        "SELECT page_id, page_number, text FROM pages ORDER BY page_number"
      ) as Array<{ page_id: string; page_number: number; text: string }>

      // Check which pages have web-rendering output, and load latest rendering
      // per page so we can compute per-section activity flags.
      const rendered = new Set<string>()
      const renderingByPage = new Map<string, { version: number; activityBySectionIndex: Map<number, boolean> }>()
      const renderRows = db.all(
        `SELECT nd.item_id AS item_id, nd.version AS version, nd.data AS data
         FROM node_data nd
         LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
         WHERE nd.node = ?
         ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`,
        ["web-rendering"]
      ) as Array<{ item_id: string; version: number; data: string }>
      for (const row of renderRows) {
        rendered.add(row.item_id)
        if (renderingByPage.has(row.item_id)) continue
        try {
          const parsed = JSON.parse(row.data) as {
            sections?: Array<{
              sectionIndex: number
              activityReasoning?: string
              activityAnswers?: Record<string, unknown>
            }>
          }
          const activityBySectionIndex = new Map<number, boolean>()
          for (const s of parsed.sections ?? []) {
            const hasActivity =
              (typeof s.activityReasoning === "string" && s.activityReasoning.length > 0) ||
              (s.activityAnswers != null && Object.keys(s.activityAnswers).length > 0)
            if (hasActivity) activityBySectionIndex.set(s.sectionIndex, true)
          }
          renderingByPage.set(row.item_id, { version: row.version, activityBySectionIndex })
        } catch {
          // Ignore malformed rendering rows — page still flagged as rendered.
        }
      }

      // Check which pages have image-captioning output
      const captioned = new Set<string>()
      const captionRows = db.all(
        "SELECT DISTINCT item_id FROM node_data WHERE node = ?",
        ["image-captioning"]
      ) as Array<{ item_id: string }>
      for (const row of captionRows) {
        captioned.add(row.item_id)
      }

      // Get image counts per page from image-filtering node data
      const imageCounts = new Map<string, number>()
      const imageRows = db.all(
        `SELECT nd.item_id AS item_id, nd.data AS data
         FROM node_data nd
         LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
         WHERE nd.node = ?
         ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`,
        ["image-filtering"]
      ) as Array<{ item_id: string; data: string }>
      for (const row of imageRows) {
        if (!imageCounts.has(row.item_id)) {
          try {
            const parsed = JSON.parse(row.data)
            const images = parsed.images as Array<{ imageId: string }>
            // Exclude page image from count
            const count = images.filter((img) => img.imageId !== `${row.item_id}_page`).length
            imageCounts.set(row.item_id, count)
          } catch {
            imageCounts.set(row.item_id, 0)
          }
        }
      }

      // Get section counts, pruned indices, sectionIds, and flattened text per page from page-sectioning node data
      const sectionCounts = new Map<string, number>()
      const prunedSections = new Map<string, number[]>()
      const sectionsByPage = new Map<string, PageSummarySection[]>()
      const sectioningVersions = new Map<string, number>()
      const structuredText = new Map<string, string>()
      const structuringRows = db.all(
        `SELECT nd.item_id AS item_id, nd.version AS version, nd.data AS data
         FROM node_data nd
         LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
         WHERE nd.node = ?
         ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`,
        ["page-sectioning"]
      ) as Array<{ item_id: string; version: number; data: string }>
      for (const row of structuringRows) {
        if (sectionCounts.has(row.item_id)) continue
        sectioningVersions.set(row.item_id, row.version)
        try {
          const parsed = JSON.parse(row.data)
          const rawSections = parsed.sections as Array<{
            sectionId?: string
            sectionType?: string
            isPruned?: boolean
            nodes?: unknown[]
          }>
          sectionCounts.set(row.item_id, rawSections?.length ?? 0)
          const pruned = (rawSections ?? []).reduce<number[]>((acc, s, i) => {
            if (s.isPruned) acc.push(i)
            return acc
          }, [])
          if (pruned.length > 0) prunedSections.set(row.item_id, pruned)

          const activityMap = renderingByPage.get(row.item_id)?.activityBySectionIndex

          // Walk a content tree, collecting visible text. Used both for the
          // whole-page preview and the per-section preview.
          const collectText = (
            nodes: unknown[] | undefined,
            { skipPruned }: { skipPruned: boolean }
          ): string => {
            const parts: string[] = []
            const walk = (node: { isPruned?: boolean; text?: string; children?: unknown[] }): void => {
              if (skipPruned && node.isPruned) return
              if (typeof node.text === "string" && node.text.length > 0) parts.push(node.text)
              if (Array.isArray(node.children)) {
                for (const c of node.children) walk(c as typeof node)
              }
            }
            for (const n of nodes ?? []) walk(n as { isPruned?: boolean; text?: string; children?: unknown[] })
            return parts.join("\n")
          }

          const sectionEntries: PageSummarySection[] = (rawSections ?? []).map((s, i) => {
            const sectionId = s.sectionId ?? `${row.item_id}_sec${String(i + 1).padStart(3, "0")}`
            // Pruned sections keep their own text in the per-section preview so
            // they can be displayed in the storyboard sidebar even when grayed out.
            const sectionText = collectText(s.nodes, { skipPruned: false })
            return {
              sectionId,
              sectionIndex: i,
              sectionType: s.sectionType ?? "",
              // Flag activities by section type (covers types with no fixed
              // answers, e.g. open-ended) and fall back to rendered activity
              // metadata. Matches the storyboard banner detection.
              isActivity:
                (s.sectionType ?? "").startsWith("activity_") || activityMap?.get(i) === true,
              isPruned: !!s.isPruned,
              textPreview: sectionText.slice(0, 200),
            }
          })
          sectionsByPage.set(row.item_id, sectionEntries)

          // Page-level preview ignores pruned sections + pruned leaves.
          const pageParts: string[] = []
          for (const section of rawSections ?? []) {
            if (section.isPruned) continue
            pageParts.push(collectText(section.nodes, { skipPruned: true }))
          }
          structuredText.set(row.item_id, pageParts.join("\n"))
        } catch {
          sectionCounts.set(row.item_id, 0)
        }
      }

      const result: PageSummary[] = pages.map((p) => ({
        pageId: p.page_id,
        pageNumber: p.page_number,
        hasRendering: rendered.has(p.page_id),
        hasCaptioning: captioned.has(p.page_id),
        textPreview: structuredText.get(p.page_id) ?? p.text.slice(0, 150),
        imageCount: imageCounts.get(p.page_id) ?? 0,
        wordCount: p.text.trim() ? p.text.trim().split(/\s+/).length : 0,
        sectionCount: sectionCounts.get(p.page_id) ?? 0,
        prunedSections: prunedSections.get(p.page_id) ?? [],
        renderingVersion: renderingByPage.get(p.page_id)?.version ?? null,
        sectioningVersion: sectioningVersions.get(p.page_id) ?? null,
        sections: sectionsByPage.get(p.page_id) ?? [],
        // Cross-check: empty extracted text layer, but the Sectioning step
        // recovered text from the page image → the PDF isn't exposing this
        // page's text directly (scanned/image-only page).
        extractionWarning: classifyExtractionWarning(p.text, structuredText.get(p.page_id)),
      }))

      return c.json(result)
    } finally {
      db.close()
    }
  })

  // GET /books/:label/pages/:pageId — Full page data with pipeline outputs
  app.get("/books/:label/pages/:pageId", (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = getDbPath(safeLabel, booksDir)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      // Get page data
      const pageRows = db.all(
        "SELECT page_id, page_number, text FROM pages WHERE page_id = ?",
        [pageId]
      ) as Array<{ page_id: string; page_number: number; text: string }>

      if (pageRows.length === 0) {
        throw new HTTPException(404, {
          message: `Page not found: ${pageId}`,
        })
      }

      const page = pageRows[0]

      // Get pipeline outputs (data + version). Reads the *current* version
      // (node_current pointer), falling back to MAX(version) when unset — so
      // rolling back to an older version is reflected here.
      const getNodeData = (node: string): { data: unknown; version: number } | null => {
        const row = readCurrentNodeRow(db, node, pageId)
        return row ? { data: JSON.parse(row.data), version: row.version } : null
      }

      const sectioningNode = getNodeData("page-sectioning")
      const imageClassNode = getNodeData("image-filtering")
      const imageCroppingNode = getNodeData("image-cropping")
      const renderingNode = getNodeData("web-rendering")
      const imageCaptioningNode = getNodeData("image-captioning")
      const positionedTextNode = getNodeData("positioned-text")
      // Book-level font profile (item_id "book", not the page id).
      const fontProfileRows = db.all(
        "SELECT data FROM node_data WHERE node = 'font-profile' AND item_id = 'book' ORDER BY version DESC LIMIT 1",
        []
      ) as Array<{ data: string }>
      const fontProfile =
        fontProfileRows.length > 0
          ? (JSON.parse(fontProfileRows[0].data) as PageDetail["fontProfile"])
          : null
      // Resolve the reflowable base font (gated): null for fixed-layout books
      // and for the Merriweather default. Mirrors resolveReflowableFontChain so
      // the storyboard preview shell can apply the same font packaging does.
      let reflowableFontFamily: string | null = null
      try {
        const cfg = loadBookConfig(safeLabel, booksDir, configPath)
        const fixedLayout = isFixedLayoutBook(cfg)
        if (!fixedLayout) {
          const registryRows = db.all(
            "SELECT data FROM node_data WHERE node = 'font-registry' AND item_id = 'book' ORDER BY version DESC LIMIT 1",
            []
          ) as Array<{ data: string }>
          const registryParsed = registryRows.length > 0
            ? BookFontRegistry.safeParse(JSON.parse(registryRows[0].data))
            : null
          const bodyFont = registryParsed?.success ? bookBodyFont(registryParsed.data) : null
          if (bodyFont) reflowableFontFamily = bookFontFamilyChain(bodyFont)
        }
        // Same resolver packaging + preview use, so the Extract display and the
        // storyboard preview can't drift from the shipped output.
        if (!reflowableFontFamily) {
          reflowableFontFamily = reflowableFontChain(fontProfile?.category ?? null, {
            fixedLayout,
            reflowableFont: cfg.reflowable_font,
          })
        }
      } catch {
        // config unavailable → no override
      }

      // Validate the stored blob against the canonical tree schema; if it
      // doesn't match (older data or a failed run), return null so the
      // editor can offer a re-run instead of crashing.
      let sectioningTreeForUI: unknown = null
      if (sectioningNode) {
        const parsed = PageSectioningOutput.safeParse(sectioningNode.data)
        if (parsed.success) sectioningTreeForUI = parsed.data
      }

      // Cross-check the empty text layer against the Sectioning step's
      // vision-recovered text (see classifyExtractionWarning). Read from the raw
      // stored blob — the SAME source the pages-summary route uses — so the
      // warning stays consistent across the grid badge, banners, sidebar, and
      // this detail view even when the blob doesn't fully validate against the
      // canonical schema. Only walked when the text layer is empty, since
      // classifyExtractionWarning short-circuits on non-empty text.
      const recoveredSectioningText =
        page.text.trim().length === 0
          ? flattenVisibleSectioningText(
              (sectioningNode?.data as { sections?: Array<{ isPruned?: boolean; nodes?: unknown[] }> } | null)
                ?.sections
            )
          : ""

      // Per-image meta (width/height/bounds) — sourced directly from the
      // images table rather than node_data so it reflects the latest state.
      const imageMetaRows = db.all(
        "SELECT image_id, width, height, bounds_x, bounds_y, bounds_w, bounds_h FROM images WHERE page_id = ? ORDER BY image_id",
        [pageId]
      ) as Array<{
        image_id: string
        width: number
        height: number
        bounds_x: number | null
        bounds_y: number | null
        bounds_w: number | null
        bounds_h: number | null
      }>
      const imagesMeta: PageDetail["imagesMeta"] = imageMetaRows.map((r) => {
        const meta: PageDetail["imagesMeta"][number] = {
          imageId: r.image_id,
          width: r.width,
          height: r.height,
        }
        if (r.bounds_x !== null && r.bounds_y !== null && r.bounds_w !== null && r.bounds_h !== null) {
          meta.bounds = { x: r.bounds_x, y: r.bounds_y, width: r.bounds_w, height: r.bounds_h }
        }
        return meta
      })

      const result: PageDetail = {
        pageId: page.page_id,
        pageNumber: page.page_number,
        text: page.text,
        sectioningTree: sectioningTreeForUI,
        imageClassification: imageClassNode?.data ?? null,
        imageCropping: imageCroppingNode?.data ?? null,
        rendering: renderingNode?.data ?? null,
        imageCaptioning: imageCaptioningNode?.data ?? null,
        imagesMeta,
        fonts: derivePageFonts(positionedTextNode?.data),
        fontProfile,
        reflowableFontFamily,
        extractionWarning: classifyExtractionWarning(page.text, recoveredSectioningText),
        versions: {
          sectioning: sectioningNode?.version ?? null,
          imageClassification: imageClassNode?.version ?? null,
          imageCropping: imageCroppingNode?.version ?? null,
          rendering: renderingNode?.version ?? null,
          imageCaptioning: imageCaptioningNode?.version ?? null,
        },
      }

      return c.json(result)
    } finally {
      db.close()
    }
  })

  // GET /books/:label/pages/:pageId/image — Page image as base64
  app.get("/books/:label/pages/:pageId/image", (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      // Look up the page image path
      const imageId = `${pageId}_page`
      const rows = db.all(
        "SELECT path FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ path: string }>

      if (rows.length === 0) {
        throw new HTTPException(404, {
          message: `Page image not found: ${pageId}`,
        })
      }

      const imagePath = path.resolve(bookDir, rows[0].path)
      // Verify path doesn't escape book directory
      if (!imagePath.startsWith(bookDir + path.sep) && imagePath !== bookDir) {
        throw new HTTPException(400, { message: "Invalid image path" })
      }

      const imageBase64 = fs.readFileSync(imagePath).toString("base64")
      return c.json({ imageBase64 })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/spread-suggestions — Detect likely two-page spreads by
  // seam continuity across the extracted page renders.
  app.get("/books/:label/spread-suggestions", (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = getDbPath(safeLabel, booksDir)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found or not yet extracted: ${safeLabel}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)

    // Prefer suggestions computed inline during extraction.
    const stored = storage.getLatestNodeData("spread-suggestions", "book")
    const storedSuggestions = (stored?.data as { suggestions?: unknown } | undefined)?.suggestions
    if (Array.isArray(storedSuggestions)) {
      return c.json({ suggestions: storedSuggestions })
    }

    // Fallback for books extracted before inline detection: compute on the fly.
    const samples: SpreadEdgeSample[] = []
    for (const page of storage.getPages()) {
      let base64: string
      try {
        base64 = storage.getPageImageBase64(page.pageId)
      } catch {
        continue
      }
      const { leftEdge, rightEdge } = samplePageEdges(Buffer.from(base64, "base64"))
      samples.push({
        pageNumber: page.pageNumber,
        leftEdge,
        rightEdge,
        textLength: page.text?.length ?? 0,
      })
    }

    return c.json({ suggestions: detectSpreads(samples) })
  })

  // POST /books/:label/spreads/apply — Reconcile the extracted pages to the
  // given spread pairs by (re)extracting only the affected pairs and splicing
  // them in, instead of re-running the whole extraction.
  app.post("/books/:label/spreads/apply", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = getDbPath(safeLabel, booksDir)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found or not yet extracted: ${safeLabel}`,
      })
    }

    const body = await c.req.json().catch(() => ({}))
    const parsed = z
      .object({ spreadPairs: z.array(z.number().int().min(1)).default([]) })
      .safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, { message: "Invalid spreadPairs" })
    }
    const spreadPairs = parsed.data.spreadPairs

    const pdfPath = path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.pdf`)
    if (!fs.existsSync(pdfPath)) {
      throw new HTTPException(404, { message: `Source PDF not found: ${safeLabel}` })
    }

    const config = loadBookConfig(safeLabel, booksDir, configPath)
    const pdfBuffer = fs.readFileSync(pdfPath)
    const total = countPdfPages(pdfBuffer)
    const start = (config.start_page ?? 1) - 1
    const end = Math.min(config.end_page ?? total, total)

    const idOf = (g: number[]) =>
      g.length === 2
        ? "pg" + String(g[0] + 1).padStart(3, "0") + String(g[1] + 1).padStart(3, "0")
        : "pg" + String(g[0] + 1).padStart(3, "0")

    const desiredGroups = computeGroups(start, end, { spreadMode: false, spreadPairs })
    const desiredIds = new Set(desiredGroups.map(idOf))

    const storage = createBookStorage(safeLabel, booksDir)
    const currentIds = new Set(storage.getPages().map((p) => p.pageId))

    const toAdd = desiredGroups.filter((g) => !currentIds.has(idOf(g)))
    const toRemove = [...currentIds].filter((id) => !desiredIds.has(id))

    if (toAdd.length > 0) {
      const autoFigureMode = resolveFigureExtractionMode(config) === "auto"
      const newPages = await extractPages({
        pdfBuffer,
        groups: toAdd,
        ...figureExtractionFlags(config),
        removeWatermarks: config.remove_watermarks === true,
        fixedLayout: isFixedLayoutBook(config),
      })
      const imageClassifyConfig = {
        ...buildImageClassifyConfig(config),
        getImageBytes: (imageId: string) =>
          Buffer.from(storage.getImageBase64(imageId), "base64"),
      }
      for (const page of newPages) {
        storage.putExtractedPage(page)
        storage.putNodeData("positioned-text", page.pageId, page.positionedText)
        if (page.extractionDebug) {
          storage.putNodeData("extraction-debug", page.pageId, page.extractionDebug)
        }
        const classified = classifyPageImages(
          page.pageId,
          storage.getPageImages(page.pageId),
          imageClassifyConfig,
        )
        storage.putNodeData(
          "image-filtering",
          page.pageId,
          autoFigureMode
            ? deduplicateAutoFigureCandidates(classified, page.extractionDebug)
            : classified,
        )
      }
    }
    for (const id of toRemove) storage.deletePage(id)

    return c.json({
      merged: toAdd.length,
      removed: toRemove.length,
      pageCount: storage.getPages().length,
    })
  })

  // GET /books/:label/pages/:pageId/sections/:sectionIndex/screenshot — Rendered section as PNG
  // Lazily generates a Playwright screenshot of the section's rendered HTML and
  // caches it on disk keyed by HTML hash + viewport, so subsequent requests are
  // fast and the cache invalidates automatically when rendering changes.
  app.get(
    "/books/:label/pages/:pageId/sections/:sectionIndex/screenshot",
    async (c) => {
      const { label, pageId, sectionIndex } = c.req.param()
      const safeLabel = parseBookLabel(label)
      const idx = parseInt(sectionIndex, 10)
      if (isNaN(idx) || idx < 0) {
        throw new HTTPException(400, { message: "Invalid section index" })
      }
      const viewportLabel = c.req.query("viewport") ?? "desktop"
      const viewport = SCREENSHOT_VIEWPORTS.find((v) => v.label === viewportLabel)
      if (!viewport) {
        throw new HTTPException(400, { message: `Unknown viewport: ${viewportLabel}` })
      }

      const resolvedDir = path.resolve(booksDir)
      const bookDir = path.join(resolvedDir, safeLabel)
      const dbPath = path.join(bookDir, `${safeLabel}.db`)
      if (!fs.existsSync(dbPath)) {
        throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
      }

      // Look up the section's rendered HTML.
      const db = openBookDb(dbPath)
      let sectionHtml: string
      try {
        // Read the *current* rendering (pointer-aware) so screenshots/exports
        // match a rolled-back version, not MAX.
        const row = readCurrentNodeRow(db, "web-rendering", pageId)
        if (!row) {
          throw new HTTPException(404, { message: `No rendering for page: ${pageId}` })
        }
        const parsed = WebRenderingOutput.safeParse(JSON.parse(row.data))
        if (!parsed.success) {
          throw new HTTPException(500, { message: `Rendering data malformed for ${pageId}` })
        }
        const section = parsed.data.sections.find((s) => s.sectionIndex === idx)
        if (!section) {
          throw new HTTPException(404, { message: `Section ${idx} has no rendering` })
        }
        sectionHtml = section.html
      } finally {
        db.close()
      }

      // Resolve images referenced by the section HTML so screenshots show real pixels.
      const referencedImageIds = new Set<string>()
      const imgDataIdRegex = /<img\s[^>]*data-id="([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = imgDataIdRegex.exec(sectionHtml)) !== null) {
        referencedImageIds.add(m[1])
      }
      const storage = createBookStorage(safeLabel, booksDir)
      const images = new Map<string, { base64: string }>()
      let typographyCss = ""
      try {
        for (const id of referencedImageIds) {
          try {
            images.set(id, { base64: storage.getImageBase64(id) })
          } catch {
            // Image missing — screenshot will show a broken image.
          }
        }
        typographyCss = resolveTypographyCss(storage)
      } finally {
        storage.close()
      }

      const screenshotHtml = await buildScreenshotHtml({
        sectionHtml,
        label: safeLabel,
        images,
        webAssetsDir,
        typographyCss,
      })

      // Cache key incorporates HTML + viewport so cache invalidates whenever
      // either changes. Stored under .section-renders/ inside the book dir.
      const cacheDir = path.join(bookDir, ".section-renders")
      fs.mkdirSync(cacheDir, { recursive: true })
      const hash = crypto
        .createHash("sha256")
        .update(`${viewport.label}:${viewport.width}x${viewport.height}\n${screenshotHtml}`)
        .digest("hex")
        .slice(0, 16)
      const cachePath = path.join(cacheDir, `${hash}.png`)

      if (!fs.existsSync(cachePath)) {
        const renderer = await getSharedScreenshotRenderer()
        const base64 = await renderer.screenshot(screenshotHtml, {
          width: viewport.width,
          height: viewport.height,
        })
        fs.writeFileSync(cachePath, Buffer.from(base64, "base64"))
      }

      const buffer = fs.readFileSync(cachePath)
      c.header("Cache-Control", "private, max-age=300")
      c.header("Content-Type", "image/png")
      return c.body(buffer)
    }
  )

  // PUT /books/:label/pages/:pageId/sectioning — Update sectioning with canonical tree data
  app.put("/books/:label/pages/:pageId/sectioning", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = PageSectioningOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid page-sectioning data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      // Sectioning change cascades to everything downstream.
      const version = saveStoryboardNode(storage, "page-sectioning", pageId, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/pages/:pageId/image-filtering — Update image classification
  app.put("/books/:label/pages/:pageId/image-filtering", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = ImageClassificationOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid image-filtering data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = storage.putNodeData("image-filtering", pageId, parsed.data)
      clearCaptionData(storage)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/pages/:pageId/rendering — Update web rendering
  app.put("/books/:label/pages/:pageId/rendering", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = WebRenderingOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid web-rendering data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = saveStoryboardNode(storage, "web-rendering", pageId, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/pages/:pageId/storyboard — one Storyboard editor save.
  //
  // Sectioning and rendering are two nodes but one user action, and splitting
  // them across two requests is what made the editor fragile: the second PUT can
  // fail (or be rejected by the pipeline-run guard) after the first has already
  // landed, leaving the HTML and the tree disagreeing with no way back. Writing
  // both here means the guard runs once, up front, and the pair moves together.
  //
  // `renderingInSync` says the stored HTML reflects this sectioning, or will
  // shortly: the caller either mirrored the edit into the rendering it is
  // sending, needed no HTML change at all, or has queued a re-render of the one
  // section it touched. Storyboard editing is incremental by design, so a
  // per-section edit must not reset the stage for the whole book. It is false
  // only when the HTML cannot be brought back in sync — no API key, or a custom
  // activity a re-render would flatten — and false is also the default, so the
  // Sectioning stage and the structural ops that drop HTML without re-rendering
  // (split, cross-page merge) keep marking the chain stale.
  app.put("/books/:label/pages/:pageId/storyboard", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = z
      .object({
        sectioning: PageSectioningOutput.optional(),
        rendering: WebRenderingOutput.optional(),
        renderingInSync: z.boolean().default(false),
      })
      .safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid storyboard save: ${parsed.error.message}`,
      })
    }
    const { sectioning, rendering, renderingInSync } = parsed.data
    if (!sectioning && !rendering) {
      throw new HTTPException(400, {
        message: "Storyboard save must include sectioning, rendering, or both",
      })
    }
    // The flag only describes a sectioning write; on its own it would silently
    // do nothing, which is worth a 400 rather than a puzzling no-op.
    if (renderingInSync && !sectioning) {
      throw new HTTPException(400, {
        message: "renderingInSync requires sectioning",
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      // Guard before either write, so a rejected save changes nothing at all.
      if (sectioning) assertNoActivePipelineRun(storage)

      // Rendering, sectioning, downstream invalidations, and step status are a
      // single editor save. If any statement fails, none of them may survive.
      const { renderingVersion, sectioningVersion } = storage.transaction(() => ({
        renderingVersion: rendering
          ? saveStoryboardNode(storage, "web-rendering", pageId, rendering)
          : null,
        sectioningVersion: sectioning
          ? saveStoryboardNode(storage, "page-sectioning", pageId, sectioning, { renderingInSync })
          : null,
      }))

      return c.json({ sectioningVersion, renderingVersion })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/versions/:node/:itemId/restore — roll an entity back to
  // an existing version by moving its current-version pointer (no new version
  // is created). Supports the nodes exposed by the shared version picker
  // (itemId = page id / "book" / language code).
  app.post("/books/:label/versions/:node/:itemId/restore", async (c) => {
    const { label, itemId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const parsedNode = RestorableNode.safeParse(c.req.param("node"))
    if (!parsedNode.success) {
      throw new HTTPException(400, { message: "Unsupported versioned node" })
    }
    const node = parsedNode.data

    const parsed = z
      .object({ version: z.number().int().positive() })
      .safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid restore request: ${parsed.error.message}`,
      })
    }
    const { version } = parsed.data

    // Don't materialize a book directory for a label that doesn't exist.
    const dbPath = path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)
    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const previousData = storage.getLatestNodeData(node, itemId)?.data
      const ok = storage.setCurrentNodeVersion(node, itemId, version)
      if (!ok) {
        throw new HTTPException(404, {
          message: `Version ${version} not found for ${node}/${itemId}`,
        })
      }
      clearRestoredNodeDependents(storage, node, itemId, previousData)
      return c.json({ node, itemId, version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/pages/:pageId/image-captioning — Update image captioning
  app.put("/books/:label/pages/:pageId/image-captioning", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = ImageCaptioningOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid image-captioning data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = storage.putNodeData("image-captioning", pageId, parsed.data)
      // Caption change cascades to text-catalog, translations, TTS, and package output.
      storage.clearNodesByType([
        "text-catalog",
        "text-catalog-translation",
        "core-tts-catalog",
        "tts",
        "tts-timestamps",
        "accessibility-assessment",
      ])
      storage.clearStepRuns([
        "text-catalog",
        "catalog-translation",
        "core-tts-catalog",
        "image-translation",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ])
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/pages/re-render — Re-render a set of pages as one task.
  // This is used by cross-page edits: the Storyboard step stays running until
  // every affected page succeeds, and any failure makes the whole stage stale.
  app.post("/books/:label/pages/re-render", async (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, { message: "Missing X-OpenAI-Key header" })
    }

    const parsed = z
      .object({ pageIds: z.array(z.string().min(1)).min(1).max(100) })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid re-render request: ${parsed.error.message}`,
      })
    }
    const pageIds = [...new Set(parsed.data.pageIds)]

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const existingPageIds = new Set(storage.getPages().map((page) => page.pageId))
      for (const pageId of pageIds) {
        if (!existingPageIds.has(pageId)) {
          throw new HTTPException(404, { message: `Page not found: ${pageId}` })
        }
        const sectioningRow = storage.getLatestNodeData("page-sectioning", pageId)
        if (!sectioningRow) {
          throw new HTTPException(400, {
            message: `Page must have page-sectioning data before re-rendering: ${pageId}`,
          })
        }
        if (!PageSectioningOutput.safeParse(sectioningRow.data).success) {
          throw new HTTPException(400, {
            message: `Invalid page-sectioning data: ${pageId}`,
          })
        }
      }

      assertNoActivePipelineRun(storage)
      storage.markStepStarted("web-rendering")
    } finally {
      storage.close()
    }

    const markBatchFailed = () => {
      const failedStorage = createBookStorage(safeLabel, booksDir)
      try {
        markStoryboardChainStale(failedStorage)
      } finally {
        failedStorage.close()
      }
    }

    const runReRenders = async () => {
      try {
        const results = []
        // reRenderPage temporarily installs the key in process.env, so run the
        // pages serially rather than letting concurrent calls race that state.
        for (const pageId of pageIds) {
          results.push(
            await reRenderPage({
              label: safeLabel,
              pageId,
              booksDir,
              promptsDir,
              webAssetsDir,
              configPath,
              apiKey,
            })
          )
        }

        const completedStorage = createBookStorage(safeLabel, booksDir)
        try {
          completedStorage.markStepCompleted("web-rendering")
        } finally {
          completedStorage.close()
        }
        return { results }
      } catch (err) {
        markBatchFailed()
        throw err
      }
    }

    if (taskService) {
      try {
        const { taskId } = taskService.submitTask(
          safeLabel,
          "re-render",
          `Re-rendering ${pageIds.length} affected page(s)`,
          runReRenders,
          { pageId: pageIds[0], url: `/books/${safeLabel}/storyboard/${pageIds[0]}` }
        )
        return c.json({ taskId, status: "submitted" })
      } catch (err) {
        markBatchFailed()
        throw err
      }
    }

    return c.json(await runReRenders())
  })

  // POST /books/:label/pages/:pageId/re-render — Re-render page with current pipeline data
  app.post("/books/:label/pages/:pageId/re-render", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const ReRenderQuery = z.object({
      sectionIndex: z.coerce.number().int().min(0).optional(),
    })
    const queryParsed = ReRenderQuery.safeParse({
      sectionIndex: c.req.query("sectionIndex"),
    })
    if (!queryParsed.success) {
      throw new HTTPException(400, {
        message: `Invalid query params: ${queryParsed.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { sectionIndex } = queryParsed.data

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, {
        message: "Missing X-OpenAI-Key header",
      })
    }

    // Optional prompt for LLM guidance during re-render
    let prompt: string | undefined
    try {
      const body = await c.req.json()
      const parsed = z.object({ prompt: z.string().optional() }).safeParse(body)
      if (parsed.success) {
        prompt = parsed.data.prompt
      }
    } catch {
      // No body or not JSON — that's fine, prompt is optional
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      if (sectionIndex !== undefined) {
        const structuringRow = storage.getLatestNodeData("page-sectioning", pageId)
        if (!structuringRow) {
          throw new HTTPException(400, {
            message: "Page must have page-sectioning data before re-rendering",
          })
        }
        const structuringParsed = PageSectioningOutput.safeParse(structuringRow.data)
        if (!structuringParsed.success) {
          throw new HTTPException(400, { message: "Invalid page-sectioning data" })
        }
        if (sectionIndex >= structuringParsed.data.sections.length) {
          throw new HTTPException(400, {
            message: `Section index ${sectionIndex} out of range (page has ${structuringParsed.data.sections.length} sections)`,
          })
        }
      }
    } finally {
      storage.close()
    }

    // An unprune keeps the storyboard marked complete on the promise that this
    // re-render will supply the section's HTML. When it dies that HTML never
    // arrives, so take the mark back here — the browser may be long gone by then,
    // and a stage claiming output it does not have is what #642 set out to fix.
    const runReRender = async () => {
      try {
        return await reRenderPage({
          label: safeLabel,
          pageId,
          sectionIndex,
          prompt,
          booksDir,
          promptsDir,
          webAssetsDir,
          configPath,
          apiKey,
        })
      } catch (err) {
        const storage = createBookStorage(safeLabel, booksDir)
        try {
          markStoryboardChainStale(storage)
        } finally {
          storage.close()
        }
        throw err
      }
    }

    // Submit as task if TaskService is available
    if (taskService) {
      const desc = sectionIndex !== undefined
        ? `Re-rendering section ${sectionIndex + 1} of ${pageId}`
        : `Re-rendering ${pageId}`
      const { taskId } = taskService.submitTask(
        safeLabel,
        "re-render",
        desc,
        runReRender,
        { pageId, url: `/books/${safeLabel}/storyboard/${pageId}` }
      )
      return c.json({ taskId, status: "submitted" })
    }

    // Fallback: run synchronously
    return c.json(await runReRender())
  })

  // POST /books/:label/pages/:pageId/sections/:sectionIndex/ai-edit — AI-edit a section's HTML
  app.post("/books/:label/pages/:pageId/sections/:sectionIndex/ai-edit", async (c) => {
    const { label, pageId, sectionIndex } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const idx = parseInt(sectionIndex, 10)

    if (isNaN(idx) || idx < 0) {
      throw new HTTPException(400, { message: "Invalid section index" })
    }

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, { message: "Missing X-OpenAI-Key header" })
    }

    const body = await c.req.json()
    const instruction = body?.instruction
    if (!instruction || typeof instruction !== "string") {
      throw new HTTPException(400, { message: "Missing instruction in request body" })
    }

    // Submit as task if TaskService is available
    if (taskService) {
      const desc = `AI editing section ${idx + 1} of ${pageId}`
      const { taskId } = taskService.submitTask(
        safeLabel,
        "ai-edit",
        desc,
        async () => {
          const result = await aiEditSection({
            label: safeLabel,
            pageId,
            sectionIndex: idx,
            instruction,
            currentHtml: typeof body.currentHtml === "string" ? body.currentHtml : undefined,
            booksDir,
            promptsDir,
            webAssetsDir,
            configPath,
            apiKey,
          })

          // Save the edited HTML as a new rendering version
          const storage = createBookStorage(safeLabel, booksDir)
          try {
            const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
            const renderingParsed = renderingRow ? WebRenderingOutput.safeParse(renderingRow.data) : null
            if (renderingParsed?.success) {
              const updated = {
                sections: renderingParsed.data.sections.map((s) =>
                  s.sectionIndex === idx
                    ? {
                        ...s,
                        html: result.html,
                        ...(result.activityAnswers
                          ? { activityAnswers: result.activityAnswers }
                          : {}),
                      }
                    : s
                ),
              }
              saveStoryboardNode(storage, "web-rendering", pageId, updated)
            }
          } finally {
            storage.close()
          }

          return result
        },
        { pageId, url: `/books/${safeLabel}/storyboard/${pageId}` }
      )
      return c.json({ taskId, status: "submitted" })
    }

    // Fallback: run synchronously
    const result = await aiEditSection({
      label: safeLabel,
      pageId,
      sectionIndex: idx,
      instruction,
      currentHtml: typeof body.currentHtml === "string" ? body.currentHtml : undefined,
      booksDir,
      promptsDir,
      webAssetsDir,
      configPath,
      apiKey,
    })

    return c.json(result)
  })

  // GET /books/:label/pages/:pageId/sections/:sectionIndex/ai-edit-history
  // Returns chat-shaped history for this section's AI edits.
  app.get(
    "/books/:label/pages/:pageId/sections/:sectionIndex/ai-edit-history",
    (c) => {
      const { label, pageId, sectionIndex } = c.req.param()
      const safeLabel = parseBookLabel(label)
      const idx = parseInt(sectionIndex, 10)
      if (isNaN(idx) || idx < 0) {
        throw new HTTPException(400, { message: "Invalid section index" })
      }

      const dbPath = getDbPath(safeLabel, booksDir)
      const db = openBookDb(dbPath)
      try {
        const rows = db.all(
          `SELECT id, timestamp, data FROM llm_log
           WHERE item_id = ?
             AND success = 1
             AND json_extract(data, '$.sectionIndex') = ?
             AND json_extract(data, '$.promptName') IN ('html_edit', 'html_edit_verify')
           ORDER BY id ASC`,
          [pageId, idx]
        ) as Array<{ id: number; timestamp: string; data: string }>

        type Turn = {
          correlationId: string
          timestamp: string
          instruction: string
          attempts: Array<{ reasoning: string; timestamp: string; cached: boolean }>
          verify?: { applied: boolean; reason: string }
        }
        const turns = new Map<string, Turn>()

        for (const row of rows) {
          const data = JSON.parse(row.data) as {
            correlationId?: string
            promptName: string
            cacheHit?: boolean
            messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>
          }
          if (!data.correlationId) continue

          const assistantText = data.messages
            .find((m) => m.role === "assistant")
            ?.content.find((p) => p.type === "text")?.text
          if (!assistantText) continue

          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(assistantText) as Record<string, unknown>
          } catch {
            continue
          }

          if (data.promptName === "html_edit") {
            const userText = data.messages
              .find((m) => m.role === "user")
              ?.content.map((p) => (p.type === "text" ? p.text : ""))
              .join("\n") ?? ""
            const match = userText.match(/## Edit instruction\s*\n\s*([\s\S]*?)(?:\n\s*##|\n\s*$)/)
            const instruction = (match?.[1] ?? "").trim()

            let turn = turns.get(data.correlationId)
            if (!turn) {
              turn = {
                correlationId: data.correlationId,
                timestamp: row.timestamp,
                instruction,
                attempts: [],
              }
              turns.set(data.correlationId, turn)
            } else if (!turn.instruction && instruction) {
              turn.instruction = instruction
            }
            turn.attempts.push({
              reasoning: String(parsed.reasoning ?? ""),
              timestamp: row.timestamp,
              cached: Boolean(data.cacheHit),
            })
          } else if (data.promptName === "html_edit_verify") {
            const turn = turns.get(data.correlationId)
            if (turn) {
              turn.verify = {
                applied: Boolean(parsed.applied),
                reason: String(parsed.reason ?? ""),
              }
            }
          }
        }

        const history = Array.from(turns.values())
          .filter((t) => t.attempts.length > 0)
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

        return c.json({ history })
      } finally {
        db.close()
      }
    }
  )

  // POST /books/:label/pages/:pageId/sections/:sectionIndex/clone — Duplicate a section
  app.post("/books/:label/pages/:pageId/sections/:sectionIndex/clone", async (c) => {
    const CloneSectionParams = z.object({
      label: z.string().min(1),
      pageId: z.string().min(1),
      sectionIndex: z.coerce.number().int().min(0),
    })
    const parsedParams = CloneSectionParams.safeParse(c.req.param())
    if (!parsedParams.success) {
      throw new HTTPException(400, {
        message: `Invalid route params: ${parsedParams.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { label, pageId, sectionIndex: idx } = parsedParams.data
    const safeLabel = parseBookLabel(label)

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      if (!pages.find((p) => p.pageId === pageId)) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      // Read latest sectioning
      const sectioningRow = storage.getLatestNodeData("page-sectioning", pageId)
      if (!sectioningRow) {
        throw new HTTPException(400, { message: "Page has no sectioning data" })
      }
      const sectioningParsed = PageSectioningOutput.safeParse(sectioningRow.data)
      if (!sectioningParsed.success) {
        throw new HTTPException(400, { message: "Invalid page-sectioning data" })
      }
      const sectioning = sectioningParsed.data

      if (idx >= sectioning.sections.length) {
        throw new HTTPException(400, { message: `Section index ${idx} out of range (page has ${sectioning.sections.length} sections)` })
      }

      // Clone the section and insert after the original
      const containerIdMap = new Map<string, string>()
      const clonedSection = {
        ...sectioning.sections[idx],
        nodes: cloneNodesWithFreshContainerIds(
          sectioning.sections[idx].nodes,
          createNodeIdFactory(pageId, sectioning.sections),
          containerIdMap
        ),
      }
      const newSections = [...sectioning.sections]
      newSections.splice(idx + 1, 0, clonedSection)

      renumberSectionIds(newSections, pageId)

      const updatedSectioning = { ...sectioning, sections: newSections }

      // Clone rendering if present
      let updatedRendering: z.infer<typeof WebRenderingOutput> | null = null
      let renderingVersion: number | null = null
      const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
      if (renderingRow) {
        const renderingParsed = WebRenderingOutput.safeParse(renderingRow.data)
        if (!renderingParsed.success) {
          throw new HTTPException(400, { message: "Invalid web-rendering data" })
        }
        const rendering = renderingParsed.data

        // Shift sectionIndex for entries after the cloned position
        const shifted = rendering.sections.map((s) =>
          s.sectionIndex > idx ? { ...s, sectionIndex: s.sectionIndex + 1 } : { ...s }
        )

        // Clone the rendering entry for the source section
        const sourceRendering = shifted.find((s) => s.sectionIndex === idx)
        if (sourceRendering) {
          const clonedRendering = structuredClone(sourceRendering)
          clonedRendering.sectionIndex = idx + 1
          clonedRendering.html = rewriteContainerIdsInHtml(
            clonedRendering.html,
            containerIdMap
          )

          // Insert clone after the source in the array
          const insertPos = shifted.indexOf(sourceRendering) + 1
          shifted.splice(insertPos, 0, clonedRendering)
        }

        rewriteRenderingSectionIds(shifted, newSections)
        updatedRendering = { sections: shifted }
      }
      // Cloning rebuilds the rendering to match: indexes shift, the source's HTML
      // is copied for the clone, and container and section ids are rewritten. No
      // LLM is involved and nothing is left behind, so the storyboard stays
      // current — only the stages derived from it need a re-run.
      const sectioningVersion = saveStoryboardNode(
        storage,
        "page-sectioning",
        pageId,
        updatedSectioning,
        { renderingInSync: updatedRendering !== null }
      )
      if (updatedRendering) {
        renderingVersion = saveStoryboardNode(storage, "web-rendering", pageId, updatedRendering)
      }
      migrateEditableActivities(storage, pageId, {
        mapIndex: (i) => (i > idx ? i + 1 : i),
        cloneIndex: idx,
      })

      return c.json({
        clonedSectionIndex: idx + 1,
        sectioningVersion,
        renderingVersion,
      })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/pages/:pageId/sections/:sectionIndex/split — Split a section in two before a top-level node
  app.post("/books/:label/pages/:pageId/sections/:sectionIndex/split", async (c) => {
    const SplitSectionParams = z.object({
      label: z.string().min(1),
      pageId: z.string().min(1),
      sectionIndex: z.coerce.number().int().min(0),
    })
    const parsedParams = SplitSectionParams.safeParse(c.req.param())
    if (!parsedParams.success) {
      throw new HTTPException(400, {
        message: `Invalid route params: ${parsedParams.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { label, pageId, sectionIndex: idx } = parsedParams.data
    const safeLabel = parseBookLabel(label)

    const SplitSectionBody = z
      .object({
        beforeNodeIndex: z.number().int().min(1).optional(),
        beforeNodeId: z.string().min(1).optional(),
      })
      .refine((b) => (b.beforeNodeIndex == null) !== (b.beforeNodeId == null), {
        message: "Provide exactly one of beforeNodeIndex or beforeNodeId",
      })
    const parsedBody = SplitSectionBody.safeParse(await c.req.json().catch(() => null))
    if (!parsedBody.success) {
      throw new HTTPException(400, {
        message: `Invalid body: ${parsedBody.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { beforeNodeIndex, beforeNodeId } = parsedBody.data

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      if (!pages.find((p) => p.pageId === pageId)) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      // Read latest sectioning
      const sectioningRow = storage.getLatestNodeData("page-sectioning", pageId)
      if (!sectioningRow) {
        throw new HTTPException(400, { message: "Page has no sectioning data" })
      }
      const sectioningParsed = PageSectioningOutput.safeParse(sectioningRow.data)
      if (!sectioningParsed.success) {
        throw new HTTPException(400, { message: "Invalid page-sectioning data" })
      }
      const sectioning = sectioningParsed.data

      if (idx >= sectioning.sections.length) {
        throw new HTTPException(400, { message: `Section index ${idx} out of range (page has ${sectioning.sections.length} sections)` })
      }
      const section = sectioning.sections[idx]

      let keptNodes: ContentNodeData[]
      let movedNodes: ContentNodeData[]
      if (beforeNodeId != null) {
        // Split before a node at any depth: ancestor containers along the
        // path are split too, with the moved shells getting fresh ids.
        const result = splitNodesBefore(
          section.nodes,
          beforeNodeId,
          createNodeIdFactory(pageId, sectioning.sections)
        )
        if (!result) {
          throw new HTTPException(400, { message: `Cannot split before node ${beforeNodeId}: node not found in section ${idx}, or nothing would remain in the first half` })
        }
        keptNodes = result.before
        movedNodes = result.after
      } else {
        if (beforeNodeIndex! >= section.nodes.length) {
          throw new HTTPException(400, { message: `Cannot split before node ${beforeNodeIndex}: section has ${section.nodes.length} top-level nodes and both halves need at least one` })
        }
        keptNodes = section.nodes.slice(0, beforeNodeIndex!)
        movedNodes = section.nodes.slice(beforeNodeIndex!)
      }

      // Partition the fixed-layout placement sidecar by subtree membership.
      // Entries for nodes in neither half (ancestor shells dropped by a
      // nested split) are discarded.
      let keptPlacement: typeof section.placement
      let movedPlacement: typeof section.placement
      if (section.placement) {
        const collectIds = (nodes: ContentNodeData[], into: Set<string>) => {
          for (const node of nodes) {
            into.add(node.nodeId)
            if (node.children) collectIds(node.children, into)
          }
        }
        const keptIds = new Set<string>()
        const movedIds = new Set<string>()
        collectIds(keptNodes, keptIds)
        collectIds(movedNodes, movedIds)
        keptPlacement = {}
        movedPlacement = {}
        for (const [nodeId, placement] of Object.entries(section.placement)) {
          if (movedIds.has(nodeId)) movedPlacement[nodeId] = placement
          else if (keptIds.has(nodeId)) keptPlacement[nodeId] = placement
        }
      }

      // Narrow cross-page provenance per half: a half keeps a source page
      // only while it still contains nodes originating from it (node ids
      // embed their source page as a `${pageId}_` prefix).
      const narrowSourcePageIds = (nodes: ContentNodeData[]): string[] | undefined => {
        const containsPrefix = (list: ContentNodeData[], prefix: string): boolean =>
          list.some(
            (node) =>
              node.nodeId.startsWith(prefix) ||
              (node.children ? containsPrefix(node.children, prefix) : false)
          )
        const kept = (section.sourcePageIds ?? []).filter((sourcePageId) =>
          containsPrefix(nodes, `${sourcePageId}_`)
        )
        return kept.length > 0 ? kept : undefined
      }

      const keptSection = {
        ...section,
        nodes: keptNodes,
        ...(keptPlacement ? { placement: keptPlacement } : {}),
      }
      const movedSection = {
        ...section,
        nodes: movedNodes,
        ...(movedPlacement ? { placement: movedPlacement } : {}),
      }
      delete keptSection.sourcePageIds
      delete movedSection.sourcePageIds
      const keptProvenance = narrowSourcePageIds(keptNodes)
      const movedProvenance = narrowSourcePageIds(movedNodes)
      if (keptProvenance) keptSection.sourcePageIds = keptProvenance
      if (movedProvenance) movedSection.sourcePageIds = movedProvenance

      const newSections = [...sectioning.sections]
      newSections[idx] = keptSection
      newSections.splice(idx + 1, 0, movedSection)

      renumberSectionIds(newSections, pageId)

      const updatedSectioning = { ...sectioning, sections: newSections }

      // Update rendering if present: the split section's HTML cannot be
      // partitioned mechanically, so drop its entry (both halves re-render);
      // other sections keep their HTML with shifted indexes.
      let updatedRendering: z.infer<typeof WebRenderingOutput> | null = null
      let renderingVersion: number | null = null
      const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
      if (renderingRow) {
        const renderingParsed = WebRenderingOutput.safeParse(renderingRow.data)
        if (!renderingParsed.success) {
          throw new HTTPException(400, { message: "Invalid web-rendering data" })
        }
        const rendering = renderingParsed.data

        const shifted = rendering.sections
          .filter((s) => s.sectionIndex !== idx)
          .map((s) =>
            s.sectionIndex > idx ? { ...s, sectionIndex: s.sectionIndex + 1 } : { ...s }
          )

        rewriteRenderingSectionIds(shifted, newSections)
        updatedRendering = { sections: shifted }
      }

      const sectioningVersion = saveStoryboardNode(storage, "page-sectioning", pageId, updatedSectioning)
      if (updatedRendering) {
        renderingVersion = saveStoryboardNode(storage, "web-rendering", pageId, updatedRendering)
      }
      // The split section's entry is dropped (like its rendering) — the stored
      // extraction covered the whole section and matches neither half.
      migrateEditableActivities(storage, pageId, {
        mapIndex: (i) => (i === idx ? null : i > idx ? i + 1 : i),
      })

      return c.json({
        splitSectionIndex: idx + 1,
        sectioningVersion,
        renderingVersion,
      })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/pages/:pageId/sections/:sectionIndex/merge — Merge two adjacent sections
  app.post("/books/:label/pages/:pageId/sections/:sectionIndex/merge", async (c) => {
    const MergeSectionParams = z.object({
      label: z.string().min(1),
      pageId: z.string().min(1),
      sectionIndex: z.coerce.number().int().min(0),
    })
    const parsedParams = MergeSectionParams.safeParse(c.req.param())
    if (!parsedParams.success) {
      throw new HTTPException(400, {
        message: `Invalid route params: ${parsedParams.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { label, pageId, sectionIndex: idx } = parsedParams.data
    const safeLabel = parseBookLabel(label)

    const directionParam = c.req.query("direction") ?? "next"
    if (directionParam !== "next" && directionParam !== "prev") {
      throw new HTTPException(400, { message: `Invalid direction: ${directionParam}. Must be "next" or "prev"` })
    }
    const direction = directionParam as "next" | "prev"
    // The Storyboard editor re-renders the merged section straight after, so it
    // opts out of marking the stage stale. Off by default for every other caller.
    const renderingInSync = c.req.query("renderingInSync") === "1"

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      if (!pages.find((p) => p.pageId === pageId)) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      // Read latest sectioning
      const sectioningRow = storage.getLatestNodeData("page-sectioning", pageId)
      if (!sectioningRow) {
        throw new HTTPException(400, { message: "Page has no sectioning data" })
      }
      const sectioningParsed = PageSectioningOutput.safeParse(sectioningRow.data)
      if (!sectioningParsed.success) {
        throw new HTTPException(400, { message: "Invalid page-sectioning data" })
      }
      const sectioning = sectioningParsed.data

      if (idx >= sectioning.sections.length) {
        throw new HTTPException(400, { message: `Section index ${idx} out of range (page has ${sectioning.sections.length} sections)` })
      }

      // Determine which two sections to merge
      if (direction === "next" && idx >= sectioning.sections.length - 1) {
        throw new HTTPException(400, { message: `Cannot merge "next": section ${idx} is the last section` })
      }
      if (direction === "prev" && idx === 0) {
        throw new HTTPException(400, { message: `Cannot merge "prev": section ${idx} is the first section` })
      }

      const keepIdx = direction === "next" ? idx : idx - 1
      const removeIdx = direction === "next" ? idx + 1 : idx

      // Combine: append remove section's nodes into keep section
      const newSections = [...sectioning.sections]
      const keepSection = newSections[keepIdx]
      const removeSection = newSections[removeIdx]
      newSections[keepIdx] = {
        ...keepSection,
        nodes: [...keepSection.nodes, ...removeSection.nodes],
      }
      // Carry over the fixed-layout sidecar from the removed section — its
      // nodes keep their placement, and keep's entries win on conflict.
      if (keepSection.placement || removeSection.placement) {
        newSections[keepIdx].placement = {
          ...removeSection.placement,
          ...keepSection.placement,
        }
      }
      if (!keepSection.viewport && removeSection.viewport) {
        newSections[keepIdx].viewport = removeSection.viewport
      }
      // Union cross-page provenance from both sections.
      if (keepSection.sourcePageIds || removeSection.sourcePageIds) {
        newSections[keepIdx].sourcePageIds = [
          ...new Set([
            ...(keepSection.sourcePageIds ?? []),
            ...(removeSection.sourcePageIds ?? []),
          ]),
        ]
      }
      newSections.splice(removeIdx, 1)

      renumberSectionIds(newSections, pageId)

      const updatedSectioning = { ...sectioning, sections: newSections }

      // Update rendering if present
      let updatedRendering: z.infer<typeof WebRenderingOutput> | null = null
      let renderingVersion: number | null = null
      const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
      if (renderingRow) {
        const renderingParsed = WebRenderingOutput.safeParse(renderingRow.data)
        if (!renderingParsed.success) {
          throw new HTTPException(400, { message: "Invalid web-rendering data" })
        }
        const rendering = renderingParsed.data

        const shifted = [...rendering.sections]

        // Find rendering entries for keepIdx and removeIdx
        const keepEntry = shifted.find((s) => s.sectionIndex === keepIdx)
        const removeEntry = shifted.find((s) => s.sectionIndex === removeIdx)

        // Merge HTML if both entries exist
        if (keepEntry && removeEntry) {
          // Extract inner content from remove section's <section> tag and append into keep section's <section>
          const innerContentMatch = removeEntry.html.match(/<section[^>]*>([\s\S]*)<\/section>/)
          const innerContent = innerContentMatch ? innerContentMatch[1] : removeEntry.html
          keepEntry.html = keepEntry.html.replace(/<\/section>\s*$/, `${innerContent}</section>`)
        }

        // Remove the removeIdx rendering entry
        const removeEntryIndex = shifted.findIndex((s) => s.sectionIndex === removeIdx)
        if (removeEntryIndex !== -1) {
          shifted.splice(removeEntryIndex, 1)
        }

        // Shift sectionIndex for entries after removeIdx (subtract 1)
        for (const s of shifted) {
          if (s.sectionIndex > removeIdx) {
            s.sectionIndex = s.sectionIndex - 1
          }
        }

        rewriteRenderingSectionIds(shifted, newSections)
        updatedRendering = { sections: shifted }
      }

      // Merging concatenates the two sections' HTML into the kept entry, so no
      // section is left without one — the caller's re-render replaces the naive
      // join with properly combined markup rather than filling a gap.
      const sectioningVersion = saveStoryboardNode(
        storage,
        "page-sectioning",
        pageId,
        updatedSectioning,
        { renderingInSync: renderingInSync && updatedRendering !== null }
      )
      if (updatedRendering) {
        renderingVersion = saveStoryboardNode(storage, "web-rendering", pageId, updatedRendering)
      }
      // Both merged sections' entries are dropped: the kept section's content
      // changed (the stored extraction is stale) and the removed one is gone.
      migrateEditableActivities(storage, pageId, {
        mapIndex: (i) =>
          i === keepIdx || i === removeIdx ? null : i > removeIdx ? i - 1 : i,
      })

      return c.json({
        mergedSectionIndex: keepIdx,
        sectioningVersion,
        renderingVersion,
      })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/pages/:pageId/sections/:sectionIndex/merge-cross-page — Merge a section into an adjacent page
  app.post("/books/:label/pages/:pageId/sections/:sectionIndex/merge-cross-page", async (c) => {
    const MergeCrossPageParams = z.object({
      label: z.string().min(1),
      pageId: z.string().min(1),
      sectionIndex: z.coerce.number().int().min(0),
    })
    const parsedParams = MergeCrossPageParams.safeParse(c.req.param())
    if (!parsedParams.success) {
      throw new HTTPException(400, {
        message: `Invalid route params: ${parsedParams.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { label, pageId, sectionIndex: idx } = parsedParams.data
    const safeLabel = parseBookLabel(label)

    const MergeCrossPageQuery = z.object({
      direction: z.enum(["next", "prev"]).default("next"),
    })
    const parsedQuery = MergeCrossPageQuery.safeParse({ direction: c.req.query("direction") })
    if (!parsedQuery.success) {
      throw new HTTPException(400, {
        message: `Invalid query params: ${parsedQuery.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { direction } = parsedQuery.data
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const pageIndex = pages.findIndex((p) => p.pageId === pageId)
      if (pageIndex === -1) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      // Determine the target page
      const targetPageIndex = direction === "next" ? pageIndex + 1 : pageIndex - 1
      if (targetPageIndex < 0 || targetPageIndex >= pages.length) {
        throw new HTTPException(400, { message: `No ${direction === "next" ? "next" : "previous"} page to merge into` })
      }
      const targetPageId = pages[targetPageIndex].pageId

      // Load source sectioning
      const srcRow = storage.getLatestNodeData("page-sectioning", pageId)
      if (!srcRow) {
        throw new HTTPException(400, { message: "Source page has no sectioning data" })
      }
      const srcParsed = PageSectioningOutput.safeParse(srcRow.data)
      if (!srcParsed.success) {
        throw new HTTPException(400, { message: "Invalid source page-sectioning data" })
      }
      const srcSectioning = srcParsed.data

      if (idx >= srcSectioning.sections.length) {
        throw new HTTPException(400, { message: `Section index ${idx} out of range (page has ${srcSectioning.sections.length} sections)` })
      }
      const movedSection = srcSectioning.sections[idx]

      // Load target sectioning
      const tgtRow = storage.getLatestNodeData("page-sectioning", targetPageId)
      if (!tgtRow) {
        throw new HTTPException(400, { message: "Target page has no sectioning data" })
      }
      const tgtParsed = PageSectioningOutput.safeParse(tgtRow.data)
      if (!tgtParsed.success) {
        throw new HTTPException(400, { message: "Invalid target page-sectioning data" })
      }
      const tgtSectioning = tgtParsed.data

      if (tgtSectioning.sections.length === 0) {
        throw new HTTPException(400, { message: "Target page has no sections to merge into" })
      }

      // Merge into the adjacent section on the target page:
      // "next" → prepend nodes into first section of next page
      // "prev" → append nodes into last section of previous page
      const tgtIdx = direction === "next" ? 0 : tgtSectioning.sections.length - 1
      const newTgtSections = [...tgtSectioning.sections]
      if (direction === "next") {
        newTgtSections[tgtIdx] = {
          ...newTgtSections[tgtIdx],
          nodes: [...movedSection.nodes, ...newTgtSections[tgtIdx].nodes],
        }
      } else {
        newTgtSections[tgtIdx] = {
          ...newTgtSections[tgtIdx],
          nodes: [...newTgtSections[tgtIdx].nodes, ...movedSection.nodes],
        }
      }

      // Record provenance: the merged section now contains content from the
      // source page (and any pages already merged into either section), so
      // renderers can supply those page images as visual references.
      const provenance = new Set<string>([
        ...(newTgtSections[tgtIdx].sourcePageIds ?? []),
        ...(movedSection.sourcePageIds ?? []),
        pageId,
      ])
      provenance.delete(targetPageId)
      if (provenance.size > 0) {
        newTgtSections[tgtIdx].sourcePageIds = [...provenance]
      }

      // Remove from source
      const newSrcSections = [...srcSectioning.sections]
      newSrcSections.splice(idx, 1)

      renumberSectionIds(newSrcSections, pageId)

      renumberSectionIds(newTgtSections, targetPageId)

      // Save updated sectionings
      const srcVersion = saveStoryboardNode(
        storage,
        "page-sectioning",
        pageId,
        { ...srcSectioning, sections: newSrcSections }
      )
      const tgtVersion = saveStoryboardNode(
        storage,
        "page-sectioning",
        targetPageId,
        { ...tgtSectioning, sections: newTgtSections }
      )

      // Clear rendering for both pages (merged content invalidates existing renders)
      let srcRenderVersion: number | null = null
      let tgtRenderVersion: number | null = null
      const srcRenderRow = storage.getLatestNodeData("web-rendering", pageId)
      if (srcRenderRow) {
        srcRenderVersion = saveStoryboardNode(storage, "web-rendering", pageId, { sections: [] })
      }
      const tgtRenderRow = storage.getLatestNodeData("web-rendering", targetPageId)
      if (tgtRenderRow) {
        tgtRenderVersion = saveStoryboardNode(storage, "web-rendering", targetPageId, { sections: [] })
      }

      // Source: the moved section's entry goes away and later entries shift.
      // Target: the receiving section's content changed, so its entry is stale.
      migrateEditableActivities(storage, pageId, {
        mapIndex: (i) => (i === idx ? null : i > idx ? i - 1 : i),
      })
      migrateEditableActivities(storage, targetPageId, {
        mapIndex: (i) => (i === tgtIdx ? null : i),
      })

      return c.json({
        sourcePageId: pageId,
        targetPageId,
        targetSectionIndex: tgtIdx,
        sourceSectioningVersion: srcVersion,
        targetSectioningVersion: tgtVersion,
        sourceRenderingVersion: srcRenderVersion,
        targetRenderingVersion: tgtRenderVersion,
      })
    } finally {
      storage.close()
    }
  })

  // DELETE /books/:label/pages/:pageId/sections/:sectionIndex — Delete a section
  app.delete("/books/:label/pages/:pageId/sections/:sectionIndex", async (c) => {
    const DeleteSectionParams = z.object({
      label: z.string().min(1),
      pageId: z.string().min(1),
      sectionIndex: z.coerce.number().int().min(0),
    })
    const parsedParams = DeleteSectionParams.safeParse(c.req.param())
    if (!parsedParams.success) {
      throw new HTTPException(400, {
        message: `Invalid route params: ${parsedParams.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { label, pageId, sectionIndex: idx } = parsedParams.data
    const safeLabel = parseBookLabel(label)

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      if (!pages.find((p) => p.pageId === pageId)) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      // Read latest sectioning
      const sectioningRow = storage.getLatestNodeData("page-sectioning", pageId)
      if (!sectioningRow) {
        throw new HTTPException(400, { message: "Page has no sectioning data" })
      }
      const sectioningParsed = PageSectioningOutput.safeParse(sectioningRow.data)
      if (!sectioningParsed.success) {
        throw new HTTPException(400, { message: "Invalid page-sectioning data" })
      }
      const sectioning = sectioningParsed.data

      if (idx >= sectioning.sections.length) {
        throw new HTTPException(400, { message: `Section index ${idx} out of range (page has ${sectioning.sections.length} sections)` })
      }

      // Remove section at idx
      const newSections = [...sectioning.sections]
      newSections.splice(idx, 1)

      renumberSectionIds(newSections, pageId)

      const updatedSectioning = { ...sectioning, sections: newSections }

      // Update rendering if present
      let updatedRendering: z.infer<typeof WebRenderingOutput> | null = null
      let renderingVersion: number | null = null
      const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
      if (renderingRow) {
        const renderingParsed = WebRenderingOutput.safeParse(renderingRow.data)
        if (!renderingParsed.success) {
          throw new HTTPException(400, { message: "Invalid web-rendering data" })
        }
        const rendering = renderingParsed.data

        const shifted = [...rendering.sections]

        // Remove the rendering entry for idx
        const removeEntryIndex = shifted.findIndex((s) => s.sectionIndex === idx)
        if (removeEntryIndex !== -1) {
          shifted.splice(removeEntryIndex, 1)
        }

        // Shift sectionIndex for entries after idx (subtract 1)
        for (const s of shifted) {
          if (s.sectionIndex > idx) {
            s.sectionIndex = s.sectionIndex - 1
          }
        }

        rewriteRenderingSectionIds(shifted, newSections)
        updatedRendering = { sections: shifted }
      }

      // Deleting rebuilds the rendering to match: the section's HTML entry is
      // dropped, later indexes shift down, and section ids are rewritten. The
      // surviving sections keep the HTML they already had, so nothing needs
      // re-rendering and the storyboard stays current.
      const sectioningVersion = saveStoryboardNode(
        storage,
        "page-sectioning",
        pageId,
        updatedSectioning,
        { renderingInSync: updatedRendering !== null }
      )
      if (updatedRendering) {
        renderingVersion = saveStoryboardNode(storage, "web-rendering", pageId, updatedRendering)
      }
      migrateEditableActivities(storage, pageId, {
        mapIndex: (i) => (i === idx ? null : i > idx ? i - 1 : i),
      })

      return c.json({
        sectioningVersion,
        renderingVersion,
        remainingSections: newSections.length,
      })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/images/ai-generate — Generate or edit an image.
  app.post("/books/:label/images/ai-generate", async (c) => {
    try {
      const { label } = c.req.param()
      const safeLabel = parseBookLabel(label)
      const resolvedDir = path.resolve(booksDir)
      const bookDir = path.join(resolvedDir, safeLabel)
      const dbPath = path.join(bookDir, `${safeLabel}.db`)

      if (!fs.existsSync(dbPath)) {
        return c.json({ error: `Book not found: ${safeLabel}` }, 404)
      }

      const apiKey = c.req.header("X-OpenAI-Key")
      if (!apiKey) {
        return c.json({ error: "Missing X-OpenAI-Key header" }, 400)
      }

      const pageId = c.req.query("pageId")
      if (!pageId) {
        return c.json({ error: "Missing pageId query parameter" }, 400)
      }
      validateImageId(pageId)

      const body = await c.req.json()
      const prompt = body?.prompt
      if (!prompt || typeof prompt !== "string") {
        return c.json({ error: "Missing prompt in request body" }, 400)
      }

      const referenceImageId =
        typeof body.referenceImageId === "string" ? validateImageId(body.referenceImageId) : undefined
      const targetImageId =
        typeof body.targetImageId === "string" ? validateImageId(body.targetImageId) : referenceImageId

      // Optional style and image type parameters
      const style = typeof body.style === "string" ? body.style : undefined
      const imageType = typeof body.imageType === "string" ? body.imageType : undefined
      // Optional style reference image — sent alongside the reference image for edit mode
      const styleImageId =
        typeof body.styleImageId === "string" ? validateImageId(body.styleImageId) : undefined
      // Section index and mode for auto-saving sectioning/rendering after generation
      const sectionIndex = typeof body.sectionIndex === "number" ? body.sectionIndex : undefined
      const mode = body.mode === "swap" || body.mode === "add" ? body.mode : undefined

      // Validate reference images exist before submitting task
      if (referenceImageId) {
        const db0 = openBookDb(dbPath)
        try {
          const row = db0.get("SELECT path FROM images WHERE image_id = ?", [referenceImageId]) as { path: string } | undefined
          if (!row || !fs.existsSync(path.join(bookDir, row.path))) {
            return c.json({ error: `Reference image not found: ${referenceImageId}` }, 404)
          }
        } finally {
          db0.close()
        }
      }

      // Build description for task indicator
      const desc = referenceImageId
        ? `Editing image ${referenceImageId}`
        : `Generating image for ${pageId}`
      const modelId = configPath
        ? loadBookConfig(safeLabel, booksDir, configPath)
            .default_image_generation_model ?? DEFAULT_IMAGE_GENERATION_MODEL_ID
        : DEFAULT_IMAGE_GENERATION_MODEL_ID

      // Submit as task if TaskService is available
      if (taskService) {
        const { taskId } = taskService.submitTask(
          safeLabel,
          "image-generate",
          desc,
          async () => {
            return await executeAiImageGeneration({
              safeLabel, bookDir, dbPath, apiKey, pageId,
              prompt, referenceImageId, targetImageId,
              style, imageType, styleImageId, promptsDir,
              sectionIndex, mode, booksDir,
              modelId,
            })
          },
          { pageId, url: `/books/${safeLabel}/storyboard/${pageId}` }
        )
        return c.json({ taskId, status: "submitted" })
      }

      // Fallback: run synchronously
      const result = await executeAiImageGeneration({
        safeLabel, bookDir, dbPath, apiKey, pageId,
        prompt, referenceImageId, targetImageId,
        style, imageType, styleImageId, promptsDir,
        sectionIndex, mode, booksDir,
        modelId,
      })
      return c.json(result)
    } catch (err) {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status)
      }
      console.error("[ai-generate] UNHANDLED ERROR:", err)
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500)
    }
  })

  // POST /books/:label/images — Upload a cropped image
  app.post("/books/:label/images", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const formData = await c.req.formData()
    const imageFile = formData.get("image")
    const pageId = formData.get("pageId")
    const sourceImageId = formData.get("sourceImageId")

    if (!imageFile || !(imageFile instanceof File)) {
      throw new HTTPException(400, { message: "Missing image file" })
    }
    if (!pageId || typeof pageId !== "string") {
      throw new HTTPException(400, { message: "Missing pageId" })
    }
    if (!sourceImageId || typeof sourceImageId !== "string") {
      throw new HTTPException(400, { message: "Missing sourceImageId" })
    }
    validateImageId(pageId)
    validateImageId(sourceImageId)

    const buffer = Buffer.from(await imageFile.arrayBuffer())
    const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16)

    // Generate new imageId: {sourceImageId}_crop{N}
    const db = openBookDb(dbPath)
    try {
      // Find the highest existing _crop{N} suffix to avoid collisions
      const existing = db.all(
        "SELECT image_id FROM images WHERE image_id LIKE ? AND source = 'crop'",
        [`${sourceImageId}_crop%`]
      ) as Array<{ image_id: string }>
      let maxN = 0
      for (const row of existing) {
        const m = row.image_id.match(/_crop(\d+)$/)
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
      }
      const newImageId = `${sourceImageId}_crop${maxN + 1}`

      // Detect format from file type
      const isPng = imageFile.type === "image/png"
      const ext = isPng ? "png" : "jpg"
      const filename = `${newImageId}.${ext}`

      // Ensure images directory exists
      const imagesDir = path.join(bookDir, "images")
      fs.mkdirSync(imagesDir, { recursive: true })
      fs.writeFileSync(path.join(imagesDir, filename), buffer)

      // Get dimensions from the image (basic approach: read from the buffer)
      // For PNG: width at bytes 16-19, height at 20-23
      // For JPEG: more complex, use a simpler approach
      let width = 0
      let height = 0
      if (isPng && buffer.length > 24) {
        width = buffer.readUInt32BE(16)
        height = buffer.readUInt32BE(20)
      }

      db.run(
        `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (image_id) DO UPDATE SET
           page_id = excluded.page_id,
           path = excluded.path,
           hash = excluded.hash,
           width = excluded.width,
           height = excluded.height,
           source = excluded.source`,
        [newImageId, pageId, `images/${filename}`, hash, width, height, "crop"]
      )

      // Clear caption data since the image content changed
      const storage = createBookStorage(safeLabel, booksDir)
      try {
        clearCaptionData(storage)
      } finally {
        storage.close()
      }

      return c.json({ imageId: newImageId, width, height })
    } finally {
      db.close()
    }
  })

  // POST /books/:label/images/upload — Upload a new standalone image (not a crop)
  app.post("/books/:label/images/upload", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const formData = await c.req.formData()
    const imageFile = formData.get("image")
    const pageId = formData.get("pageId")

    if (!imageFile || !(imageFile instanceof File)) {
      throw new HTTPException(400, { message: "Missing image file" })
    }
    if (!pageId || typeof pageId !== "string") {
      throw new HTTPException(400, { message: "Missing pageId" })
    }
    validateImageId(pageId)

    const buffer = Buffer.from(await imageFile.arrayBuffer())
    const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16)

    const db = openBookDb(dbPath)
    try {
      // Generate new imageId: {pageId}_upload{N}
      const existing = db.all(
        "SELECT image_id FROM images WHERE image_id LIKE ? AND source = 'upload'",
        [`${pageId}_upload%`]
      ) as Array<{ image_id: string }>
      let maxN = 0
      for (const row of existing) {
        const m = row.image_id.match(/_upload(\d+)$/)
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
      }
      const newImageId = `${pageId}_upload${maxN + 1}`

      const isPng = imageFile.type === "image/png"
      const ext = isPng ? "png" : "jpg"
      const filename = `${newImageId}.${ext}`

      const imagesDir = path.join(bookDir, "images")
      fs.mkdirSync(imagesDir, { recursive: true })
      fs.writeFileSync(path.join(imagesDir, filename), buffer)

      // Get dimensions from image header
      let width = 0
      let height = 0
      if (isPng && buffer.length > 24) {
        width = buffer.readUInt32BE(16)
        height = buffer.readUInt32BE(20)
      } else if (!isPng) {
        // JPEG: scan for SOF0/SOF2 marker (0xFF 0xC0 / 0xFF 0xC2)
        for (let i = 0; i < buffer.length - 9; i++) {
          if (buffer[i] === 0xff && (buffer[i + 1] === 0xc0 || buffer[i + 1] === 0xc2)) {
            height = buffer.readUInt16BE(i + 5)
            width = buffer.readUInt16BE(i + 7)
            break
          }
        }
      }

      db.run(
        `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
         VALUES (?, ?, ?, ?, ?, ?, 'upload')`,
        [newImageId, pageId, `images/${filename}`, hash, width, height]
      )

      // Clear caption data since a new image was added
      const storage = createBookStorage(safeLabel, booksDir)
      try {
        clearCaptionData(storage)
      } finally {
        storage.close()
      }

      return c.json({ imageId: newImageId, width, height })
    } finally {
      db.close()
    }
  })

  // POST /books/:label/images/:imageId/segment — Analyze: run LLM segmentation, return bounding boxes only
  app.post("/books/:label/images/:imageId/segment", async (c) => {
    const { label, imageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    validateImageId(imageId)

    const pageId = c.req.query("pageId")
    if (!pageId) {
      return c.json({ error: "Missing pageId query parameter" }, 400)
    }
    validateImageId(pageId)

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      return c.json({ error: "Missing X-OpenAI-Key header" }, 400)
    }

    const previousKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = apiKey

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const images = storage.getPageImages(pageId)
      const imageMeta = images.find((img) => img.imageId === imageId)
      if (!imageMeta) {
        return c.json({ error: `Image not found: ${imageId}` }, 404)
      }

      // Build segmentation config — always use default model for manual segmentation
      const config = loadBookConfig(safeLabel, booksDir, configPath)
      const modelId =
        config.image_segmentation?.model
        || config.default_model
        || "openai:gpt-5.4"
      const promptName = config.image_segmentation?.prompt ?? "image_segmentation"
      const maxRetries =
        config.image_segmentation?.max_retries ?? DEFAULT_LLM_MAX_RETRIES

      const bookPromptsDir = path.join(path.resolve(booksDir), safeLabel, "prompts")
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
      const cacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
      const llmModel = createLLMModel({
        modelId,
        cacheDir,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
      })

      const imageBase64 = storage.getImageBase64(imageId)
      const pageImageBase64 = storage.getPageImageBase64(pageId)

      const segResult = await segmentPageImages(
        {
          pageId,
          pageImageBase64,
          images: [{
            imageId,
            imageBase64,
            width: imageMeta.width,
            height: imageMeta.height,
          }],
        },
        { promptName, modelId, maxRetries },
        llmModel
      )

      const imgResult = segResult.results[0]
      if (!imgResult || !imgResult.needsSegmentation || !imgResult.segments || imgResult.segments.length === 0) {
        // Still return dimensions so callers can offer a manual single-region
        // fallback (open the segment editor with one full-image box).
        return c.json({
          segmented: false,
          imageWidth: imageMeta.width,
          imageHeight: imageMeta.height,
        })
      }

      return c.json({
        segmented: true,
        imageWidth: imageMeta.width,
        imageHeight: imageMeta.height,
        regions: imgResult.segments.map((seg) => ({
          label: seg.label,
          cropLeft: seg.cropLeft,
          cropTop: seg.cropTop,
          cropRight: seg.cropRight,
          cropBottom: seg.cropBottom,
        })),
      })
    } catch (err) {
      console.error(`[segment] Error analyzing ${imageId}:`, err)
      return c.json({ error: err instanceof Error ? err.message : "Segmentation failed" }, 500)
    } finally {
      storage.close()
      if (previousKey !== undefined) {
        process.env.OPENAI_API_KEY = previousKey
      } else {
        delete process.env.OPENAI_API_KEY
      }
    }
  })

  // POST /books/:label/images/:imageId/segment/apply — Apply confirmed bounding boxes, crop and save segments
  app.post("/books/:label/images/:imageId/segment/apply", async (c) => {
    const { label, imageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    validateImageId(imageId)

    const pageId = c.req.query("pageId")
    if (!pageId) {
      return c.json({ error: "Missing pageId query parameter" }, 400)
    }
    validateImageId(pageId)

    const body = await c.req.json()
    const regionsSchema = z.object({ regions: z.array(ImageSegmentRegion).min(1) })
    const parsed = regionsSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid regions", details: parsed.error.flatten() }, 400)
    }
    const { regions } = parsed.data

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const imageBase64 = storage.getImageBase64(imageId)
      const buffer = Buffer.from(imageBase64, "base64")

      // Source image's placement on the page, so each segment can record where
      // it was extracted from (for recrop-from-page overlay).
      const sourceMeta = storage.getPageImages(pageId).find((img) => img.imageId === imageId)

      const version = storage.putNodeData("image-segmentation", pageId, {
        results: [{
          imageId,
          reasoning: "User-confirmed segmentation",
          needsSegmentation: true,
          segments: regions,
        }],
      })

      const segments: Array<{ imageId: string; label: string; width: number; height: number }> = []

      for (let i = 0; i < regions.length; i++) {
        const region = regions[i]
        const width = region.cropRight - region.cropLeft
        const height = region.cropBottom - region.cropTop
        if (width <= 0 || height <= 0) continue

        const cropped = applyCrop(buffer, {
          cropLeft: region.cropLeft,
          cropTop: region.cropTop,
          cropRight: region.cropRight,
          cropBottom: region.cropBottom,
        })

        const bounds = sourceMeta?.bounds
          ? segmentBoundsOnPage(sourceMeta.bounds, sourceMeta.width, sourceMeta.height, region)
          : undefined

        const segIndex = i + 1
        storage.putSegmentedImage({
          sourceImageId: imageId,
          segmentIndex: segIndex,
          pageId,
          version,
          buffer: cropped,
          width,
          height,
          bounds,
        })
        segments.push({
          imageId: getSegmentedImageId(imageId, segIndex, version),
          label: region.label,
          width,
          height,
        })
      }

      clearCaptionData(storage)
      return c.json({ segments })
    } catch (err) {
      console.error(`[segment/apply] Error applying segmentation for ${imageId}:`, err)
      return c.json({ error: err instanceof Error ? err.message : "Segmentation apply failed" }, 500)
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/generate-styleguide — Generate styleguide from page images
  app.post("/books/:label/generate-styleguide", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, { message: "Missing X-OpenAI-Key header" })
    }

    const body = await c.req.json()
    const PageIdsSchema = z.object({
      pageIds: z.array(z.string().min(1)).min(1).max(5),
    })
    const parsed = PageIdsSchema.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid request: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      })
    }

    const { pageIds } = parsed.data
    const resolvedBooksDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedBooksDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    // Load page images
    const storage = createBookStorage(safeLabel, booksDir)
    const pageImages: Array<{ pageId: string; pageNumber: number; imageBase64: string }> = []
    let bookFonts: ReturnType<typeof buildBookFontsPromptContext> = []
    let typography: ReturnType<typeof readTypography> | undefined
    try {
      const pages = storage.getPages()
      for (const pageId of pageIds) {
        const page = pages.find((p) => p.pageId === pageId)
        if (!page) {
          throw new HTTPException(404, { message: `Page not found: ${pageId}` })
        }
        const imageBase64 = storage.getPageImageBase64(pageId)
        pageImages.push({
          pageId,
          pageNumber: page.pageNumber,
          imageBase64,
        })
      }
      bookFonts = buildBookFontsPromptContext(storage)
      typography = readTypography(storage)
    } finally {
      storage.close()
    }

    // Set API key for LLM
    const previousKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = apiKey

    try {
      const bookPromptsDir = path.join(bookDir, "prompts")
      const appConfig = loadBookConfig(safeLabel, booksDir, configPath)
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
      const cacheDir = path.join(bookDir, ".cache")
      const config = buildStyleguideGenerationConfig(
        undefined,
        appConfig.default_model,
      )
      const llmModel = createLLMModel({
        modelId: config.modelId,
        cacheDir,
        promptEngine,
      })

      const result = await generateStyleguide(
        { pageImages, bookFonts, typography },
        config,
        llmModel
      )

      // Generated style guides are book data, so keep them inside the project
      // directory where export/import and ordinary folder copies preserve them.
      const styleguidesDir = getBookStyleguidesDir(resolvedBooksDir, safeLabel)
      const sgName = getGeneratedStyleguideName(safeLabel)
      try {
        writeStyleguideFiles({
          dir: styleguidesDir,
          name: sgName,
          content: result.content,
          previewHtml: result.preview_html,
        })
      } catch (err) {
        if (err instanceof StyleguideWriteError) {
          throw new HTTPException(500, { message: err.message })
        }
        throw err
      }

      return c.json({
        name: sgName,
        content: result.content,
        reasoning: result.reasoning,
      })
    } finally {
      if (previousKey !== undefined) {
        process.env.OPENAI_API_KEY = previousKey
      } else {
        delete process.env.OPENAI_API_KEY
      }
    }
  })

  return app
}
