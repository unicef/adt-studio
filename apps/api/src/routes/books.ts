import { createHistoryRecoveryRoutes } from "./history-recovery.js"
import { readSectioningLifecycle, recoverSectioningTransition } from "@adt/storage"
import { BookConfigError, effectiveSectioningMode, publishedAdtDirectory } from "@adt/pipeline"
import { getStageClearNodes, getStageClearOrder } from "@adt/types"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import fs from "node:fs"
import { createHash } from "node:crypto"
import { readRetainedPackageOwnership } from "../services/retained-package-reader.js"
import { readPreviewAsset } from "../services/preview-asset-validator.js"
import { BookBusyError } from "@adt/storage"
import path from "node:path"
import { z } from "zod"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import {
  parseBookLabel,
  PIPELINE,
  BookMetadata,
  SourceGeneratorStep,
  LLMModelId,
  SpeechGenerationModelId,
  AppConfig,
  type BookConfigSaveReceipt,
  type AiModality,
} from "@adt/types"
import {
  AiProviderError,
  getDefaultProviderRegistry,
  resolveModelIdFor,
  type ProviderRegistry,
} from "@adt/llm"
import { CURRENT_VERSION_ORDER, openBookDb, createBookStorage } from "@adt/storage"
import { countPdfPages, renderPdfCover } from "@adt/pdf"
import { normalizeLocale, getBaseLanguage, loadBookConfig, loadConfig, deepMerge, markSourceGenerationNeedsUpdate } from "@adt/pipeline"
import {
  listBooksAsync,
  getBook,
  createBook,
  deleteBook,
  getBookConfig,
  updateBookConfig,
} from "../services/book-service.js"
import {
  prepareExport,
  exportProject,
  exportWebpub,
  exportScorm,
  exportAdt,
  exportEpub,
  exportPnld,
  type ExportFeatures,
  type ExportDefaultSettings,
  type ExportResult,
} from "../services/export-service.js"
import { importProject, previewImport } from "../services/import-service.js"
import {
  exportPart,
  importPart,
  previewImportPart,
  isPartArchive,
  previewMerge,
  mergePart,
  getPartInfo,
  computeSplitStatus,
} from "../services/part-service.js"
import type { TaskService } from "../services/task-service.js"
import { resolvePathWithin } from "../utils/path-security.js"

function assertModelSupported(
  registry: ProviderRegistry,
  modelId: string | undefined,
  modality: AiModality,
): void {
  if (!modelId) return
  try {
    resolveModelIdFor(registry, modelId, modality)
  } catch (error) {
    if (AiProviderError.is(error)) {
      throw new HTTPException(400, { message: error.message })
    }
    throw error
  }
}

const BookConfigUpdateRequest = z.object({
  includeEffectiveConfig: z.boolean().optional(),
  config: z
    .object({
      default_model: LLMModelId.optional(),
      default_image_generation_model: LLMModelId.optional(),
      default_speech_generation_model: SpeechGenerationModelId.optional(),
    })
    .passthrough(),
})

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".dic": "application/octet-stream",
}

export function createBookRoutes(
  booksDir: string,
  webAssetsDir?: string,
  configPath?: string,
  taskService?: TaskService,
  registry: ProviderRegistry = getDefaultProviderRegistry(),
  promptsDir = path.resolve("prompts"),
): Hono {
  const app = new Hono()
  const readPackageOwners = readRetainedPackageOwnership
  app.use("/books/:label/*", bookWriterMiddleware(booksDir))
  app.use("/books/:label", bookWriterMiddleware(booksDir))
  app.route("/", createHistoryRecoveryRoutes(booksDir))

  app.get("/books", async (c) => {
    const books = await listBooksAsync(booksDir, configPath)
    return c.json(books)
  })

  app.get("/books/:label", (c) => {
    const { label } = c.req.param()
    try {
      const book = getBook(label, booksDir, configPath)
      return c.json(book)
    } catch (err) {
      if (err instanceof BookBusyError) throw err
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) {
        throw new HTTPException(404, { message })
      }
      throw new HTTPException(400, { message })
    }
  })

  // GET /books/:label/source-pdf/info — Source PDF metadata (page count)
  // Used by surfaces (e.g. Extract landing page) that need a page-range upper
  // bound before extraction has run.
  app.get("/books/:label/source-pdf/info", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const pdfPath = path.join(booksDir, safeLabel, `${safeLabel}.pdf`)
    if (!fs.existsSync(pdfPath)) {
      throw new HTTPException(404, { message: "Source PDF not found" })
    }
    try {
      const buffer = fs.readFileSync(pdfPath)
      const pageCount = countPdfPages(buffer)
      return c.json({ pageCount })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(500, { message: `Failed to read source PDF: ${message}` })
    }
  })

  // GET /books/:label/source-pdf — Stream the original source PDF inline so it
  // can be opened/viewed directly in the browser.
  app.get("/books/:label/source-pdf", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const pdfPath = path.join(booksDir, safeLabel, `${safeLabel}.pdf`)
    if (!fs.existsSync(pdfPath)) {
      throw new HTTPException(404, { message: "Source PDF not found" })
    }
    try {
      const buffer = fs.readFileSync(pdfPath)
      c.header("Content-Type", "application/pdf")
      c.header(
        "Content-Disposition",
        `inline; filename="${safeLabel}.pdf"`,
      )
      c.header("Cache-Control", "private, max-age=3600")
      return c.body(buffer)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(500, { message: `Failed to read source PDF: ${message}` })
    }
  })

  app.post("/books", async (c) => {
    const formData = await c.req.formData()
    const label = formData.get("label")
    const pdf = formData.get("pdf")
    const configJson = formData.get("config")

    if (typeof label !== "string" || !label) {
      throw new HTTPException(400, { message: "label is required" })
    }
    if (!(pdf instanceof File)) {
      throw new HTTPException(400, { message: "pdf file is required" })
    }

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer())
    const configOverrides = configJson
      ? (JSON.parse(configJson as string) as Record<string, unknown>)
      : undefined

    try {
      const book = createBook(label, pdfBuffer, booksDir, configOverrides)
      return c.json(book, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("already exists")) {
        throw new HTTPException(409, { message })
      }
      throw new HTTPException(400, { message })
    }
  })

  app.post("/books/preview-import", async (c) => {
    const formData = await c.req.formData()
    const zip = formData.get("zip")

    if (!(zip instanceof File)) {
      throw new HTTPException(400, { message: "zip file is required" })
    }

    const zipBuffer = Buffer.from(await zip.arrayBuffer())
    // A "part" archive (PDF + window + manifest, no DB) previews differently
    // from a full project; the response carries `isPart: true` to disambiguate.
    if (isPartArchive(zipBuffer)) {
      return c.json(previewImportPart(zipBuffer))
    }
    return c.json(previewImport(zipBuffer))
  })

  app.post("/books/import", async (c) => {
    const formData = await c.req.formData()
    const zip = formData.get("zip")

    if (!(zip instanceof File)) {
      throw new HTTPException(400, { message: "zip file is required" })
    }

    const zipBuffer = Buffer.from(await zip.arrayBuffer())
    const book = isPartArchive(zipBuffer)
      ? importPart(zipBuffer, booksDir)
      : await importProject(zipBuffer, booksDir)
    return c.json(book, 201)
  })

  // GET /books/:label/part-info — Manifest info if this book is an imported part
  app.get("/books/:label/part-info", (c) => {
    const { label } = c.req.param()
    return c.json(getPartInfo(label, booksDir))
  })

  // GET /books/:label/split-status — Exported-part ledger + merge coverage
  app.get("/books/:label/split-status", (c) => {
    const { label } = c.req.param()
    return c.json(computeSplitStatus(label, booksDir))
  })

  // POST /books/:label/preview-merge — Dry-run merge of a completed-part project
  app.post("/books/:label/preview-merge", async (c) => {
    const { label } = c.req.param()
    const formData = await c.req.formData()
    const zip = formData.get("zip")
    if (!(zip instanceof File)) {
      throw new HTTPException(400, { message: "zip file is required" })
    }
    const zipBuffer = Buffer.from(await zip.arrayBuffer())
    return c.json(previewMerge(label, booksDir, zipBuffer, configPath))
  })

  // POST /books/:label/merge — Merge a completed-part project into the book
  app.post("/books/:label/merge", async (c) => {
    const { label } = c.req.param()
    const formData = await c.req.formData()
    const zip = formData.get("zip")
    if (!(zip instanceof File)) {
      throw new HTTPException(400, { message: "zip file is required" })
    }
    const acknowledge = formData.get("acknowledgeSemanticsMismatch") === "true"
    const zipBuffer = Buffer.from(await zip.arrayBuffer())
    const result = mergePart(
      label,
      booksDir,
      zipBuffer,
      { acknowledgeSemanticsMismatch: acknowledge },
      configPath,
    )
    return c.json(result)
  })

  app.delete("/books/:label", (c) => {
    const { label } = c.req.param()
    try {
      deleteBook(label, booksDir)
      return c.json({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) {
        throw new HTTPException(404, { message })
      }
      throw new HTTPException(400, { message })
    }
  })

  // GET /books/:label/config — Return book-level config overrides
  app.get("/books/:label/config", (c) => {
    const { label } = c.req.param()
    try {
      const config = getBookConfig(label, booksDir)
      return c.json({ config: config ?? {} })
    } catch (err) {
      if (err instanceof BookBusyError || err instanceof BookConfigError) throw err
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) {
        throw new HTTPException(404, { message })
      }
      throw new HTTPException(400, { message })
    }
  })

  app.get("/books/:label/sectioning-state", (c) => {
    const label = parseBookLabel(c.req.param("label"))
    const bookDir = path.join(path.resolve(booksDir), label)
    if (!fs.existsSync(bookDir)) throw new HTTPException(404, { message: "Book not found" })
    recoverSectioningTransition(bookDir)
    const effectiveMode = effectiveSectioningMode(loadBookConfig(label, booksDir, configPath))
    const storage = createBookStorage(label, booksDir)
    try {
      const stages = getStageClearOrder("sectioning")
      const steps = PIPELINE.filter((stage) => stages.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name))
      const nodes = [...getStageClearNodes("sectioning"), "tts-timestamps"]
      const hasOutput = nodes.some((node) => storage.getNodeItemIds(node).length > 0)
        || storage.getStepRuns().some((row) => steps.includes(row.step as never) && ["done", "skipped"].includes(row.status))
      const lifecycle = readSectioningLifecycle(bookDir)
      return c.json({ effectiveMode, hasOutput, preferenceChanged: hasOutput && (!lifecycle?.sectioningReady || lifecycle.mode !== effectiveMode) })
    } finally { storage.close() }
  })

  // PUT /books/:label/config — Update book-level config overrides
  app.put("/books/:label/config", async (c) => {
    const { label } = c.req.param()
    const parsed = BookConfigUpdateRequest.safeParse(await c.req.json())
    if (!parsed.success) {
      throw new HTTPException(400, { message: "config object is required" })
    }
    const body = parsed.data

    assertModelSupported(registry, body.config.default_model, "structured-text")
    assertModelSupported(registry, body.config.default_image_generation_model, "image")

    try {
      // A part's page window is fixed — never let a config update move it.
      const partInfo = getPartInfo(label, booksDir)
      const config = partInfo
        ? { ...body.config, start_page: partInfo.range.startPage, end_page: partInfo.range.endPage }
        : body.config
      // Resolve before writing, so an invalid effective configuration cannot
      // turn a successful disk write into an error response. Use the same
      // preset merge/validation as the run and debug readers, not a UI merge.
      const merged = body.includeEffectiveConfig
        ? AppConfig.parse(deepMerge(loadConfig(configPath), config))
        : undefined
      updateBookConfig(label, booksDir, config, configPath)
      const updated = getBookConfig(label, booksDir)
      if (merged) return c.json({
        config: updated ?? {}, activeConfig: { merged, hasBookOverride: updated !== null },
      } satisfies BookConfigSaveReceipt)
      return c.json({ config: updated ?? {} })
    } catch (err) {
      if (err instanceof BookBusyError) throw err
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) {
        throw new HTTPException(404, { message })
      }
      throw new HTTPException(400, { message })
    }
  })

  // PUT /books/:label/metadata — Update editable book metadata
  //
  // Only title/authors/publisher/language_code are user-editable; cover_page_number
  // and reasoning are preserved by merging onto the stored metadata. Changing the
  // language invalidates every downstream LLM-derived output that depends on it so
  // they re-run against the corrected language; bibliographic edits only refresh the
  // package output.
  app.put("/books/:label/metadata", async (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : String(err),
      })
    }
    const body = await c.req.json<Partial<BookMetadata>>()

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const previousRow = storage.getLatestNodeData("metadata", "book")
      const previous = previousRow
        ? (previousRow.data as BookMetadata)
        : null
      if (!previous) {
        throw new HTTPException(404, {
          message: `No metadata to edit for book: ${safeLabel}`,
        })
      }

      // Merge only the editable fields onto the stored metadata so cover_page_number
      // and reasoning round-trip even if the client omits them.
      const merged = {
        ...previous,
        title: body.title ?? null,
        authors: body.authors ?? [],
        publisher: body.publisher ?? null,
        language_code: body.language_code
          ? normalizeLocale(body.language_code)
          : null,
      }

      const parsed = BookMetadata.safeParse(merged)
      if (!parsed.success) {
        throw new HTTPException(400, {
          message: `Invalid metadata: ${parsed.error.message}`,
        })
      }

      const prevLanguage = normalizeLocale(previous.language_code ?? "")
      const nextLanguage = normalizeLocale(parsed.data.language_code ?? "")
      const languageChanged = prevLanguage !== nextLanguage
      // Keep this response field for clients that display the scope of the
      // change. It is not an instruction to start generation after saving.
      const baseLanguageChanged =
        getBaseLanguage(prevLanguage) !== getBaseLanguage(nextLanguage)

      const config = languageChanged ? loadBookConfig(label, booksDir, configPath) : undefined
      const effectiveLanguageChanged = languageChanged &&
        normalizeLocale(config?.editing_language ?? previous.language_code ?? "en") !==
        normalizeLocale(config?.editing_language ?? parsed.data.language_code ?? "en")
      const version = storage.transaction(() => {
        const nextVersion = storage.putNodeData("metadata", "book", parsed.data)
        if (effectiveLanguageChanged) {
          // Retain source generators and translated images as usable output.
          // Catalog freshness is derived from the effective language; generator
          // review uses the existing Keep/Run contract, never null publication.
          for (const step of SourceGeneratorStep.options) {
            markSourceGenerationNeedsUpdate(storage, step)
          }
          storage.clearStepRuns(["accessibility-assessment"])
        }
        // Packaging uses bibliographic metadata as well as the language.
        storage.clearStepRuns(["package-web"])
        return nextVersion
      })

      return c.json({ version, languageChanged, baseLanguageChanged })
    } finally {
      storage.close()
    }
  })

  // NOTE: step-status endpoint is now in stages.ts (needs StageService for run state)

  // POST /books/:label/prepare-export — Rebuild adt/ (and webpub/ if needed) before download
  app.post("/books/:label/prepare-export", async (c) => {
    const { label } = c.req.param()
    const format = (c.req.query("format") ?? "project") as "project" | "webpub" | "scorm" | "adt" | "epub" | "pnld"
    let features: ExportFeatures | undefined
    let defaultSettings: ExportDefaultSettings | undefined
    const hasBody = (c.req.header("content-length") ?? "0") !== "0"
    if (hasBody) {
      try {
        const body = await c.req.json<{
          features?: ExportFeatures
          defaultSettings?: ExportDefaultSettings
        }>()
        features = body.features
        defaultSettings = body.defaultSettings
      } catch {
        throw new HTTPException(400, { message: "Invalid JSON body" })
      }
    }
    const safeLabel = parseBookLabel(label)

    if (taskService) {
      const { taskId } = taskService.submitTask(
        safeLabel,
        "prepare-export",
        `Preparing ${format} export`,
        // Returned so the task result carries any pages packaging had to omit
        // — the export otherwise completes looking clean while the bundle is
        // short.
        async () =>
          await prepareExport(label, format, booksDir, webAssetsDir ?? "", configPath, features, defaultSettings, promptsDir),
        { url: `/books/${safeLabel}/export-${format}` }
      )
      return c.json({ status: "submitted", taskId, label: safeLabel })
    }

    const { warnings } = await prepareExport(label, format, booksDir, webAssetsDir ?? "", configPath, features, defaultSettings, promptsDir)
    return c.json({ status: "completed", label: safeLabel, warnings })
  })

  // Export download routes — each format delegates to its service function,
  // then streams the ZIP with RFC 5987 Content-Disposition headers.
  const exportHandlers: Record<string, (label: string, dir: string) => Promise<ExportResult>> = {
    "export-project": exportProject,
    "export-webpub": exportWebpub,
    "export-scorm": exportScorm,
    "export-adt": exportAdt,
    "export-pnld": exportPnld,
  }

  for (const [route, handler] of Object.entries(exportHandlers)) {
    app.get(`/books/:label/${route}`, async (c) => {
      const { label } = c.req.param()
      const result = await handler(label, booksDir)
      c.header("Content-Type", "application/zip")
      const encodedName = encodeURIComponent(result.filename)
      c.header(
        "Content-Disposition",
        `attachment; filename="${result.safeFilename}"; filename*=UTF-8''${encodedName}`
      )
      return c.body(result.stream)
    })
  }

  // GET /books/:label/export-part — Download a lightweight page-range part
  // (full PDF + windowed config + fingerprint manifest) for a contributor to
  // process independently and merge back later.
  app.get("/books/:label/export-part", (c) => {
    const { label } = c.req.param()
    const startPage = Number(c.req.query("startPage"))
    const endPage = Number(c.req.query("endPage"))
    if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1) {
      throw new HTTPException(400, { message: "startPage and endPage query params are required" })
    }
    const result = exportPart(label, booksDir, { startPage, endPage }, configPath)
    c.header("Content-Type", "application/zip")
    const encodedName = encodeURIComponent(result.filename)
    c.header(
      "Content-Disposition",
      `attachment; filename="${result.safeFilename}"; filename*=UTF-8''${encodedName}`
    )
    return c.body(result.stream)
  })

  // GET /books/:label/export-epub — Download book as EPUB 3
  app.get("/books/:label/export-epub", async (c) => {
    const { label } = c.req.param()
    try {
      const result = await exportEpub(label, booksDir)
      c.header("Content-Type", "application/epub+zip")
      const encodedName = encodeURIComponent(result.filename)
      c.header(
        "Content-Disposition",
        `attachment; filename="${result.safeFilename}"; filename*=UTF-8''${encodedName}`
      )
      return c.body(result.stream)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("Book not found")) {
        throw new HTTPException(404, { message })
      }
      throw new HTTPException(400, { message })
    }
  })

  // GET /books/:label/images — List all images in a book
  app.get("/books/:label/images", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
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
      const rows = db.all(
        "SELECT image_id, page_id, width, height, source FROM images ORDER BY image_id"
      ) as Array<{
        image_id: string
        page_id: string
        width: number
        height: number
        source: string
      }>

      return c.json({
        images: rows.map((r) => ({
          imageId: r.image_id,
          pageId: r.page_id,
          width: r.width,
          height: r.height,
          source: r.source,
        })),
      })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/captioned-images — List images that have a caption
  // (i.e. are used in the storyboard and survived pruning). Used by the
  // image-translation picker so users only choose from images that will
  // actually appear in the rendered book.
  app.get("/books/:label/captioned-images", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const db = openBookDb(dbPath)
    try {
      // Pull every image-captioning row (one per page) and union the
      // imageIds referenced inside their captions[] arrays.
      const orderedCaptionRows = db.all(
        `SELECT nd.item_id AS item_id, nd.data AS data
         FROM node_data nd
         LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
         WHERE nd.node = 'image-captioning'
         ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`
      ) as Array<{ item_id: string; data: string }>
      const captionRows: Array<{ data: string }> = []
      const seenPages = new Set<string>()
      for (const row of orderedCaptionRows) {
        if (seenPages.has(row.item_id)) continue
        seenPages.add(row.item_id)
        captionRows.push(row)
      }

      const captionedIds = new Map<string, string>()
      for (const row of captionRows) {
        try {
          const parsed = JSON.parse(row.data) as {
            captions?: Array<{ imageId?: string; caption?: string; decorative?: boolean }>
          }
          for (const cap of parsed.captions ?? []) {
            // Decorative images have no caption to translate — skip them.
            if (cap.decorative) continue
            if (cap.imageId && !captionedIds.has(cap.imageId)) {
              captionedIds.set(cap.imageId, cap.caption ?? "")
            }
          }
        } catch { /* ignore malformed rows */ }
      }

      if (captionedIds.size === 0) {
        return c.json({ images: [] })
      }

      const placeholders = Array.from(captionedIds.keys()).map(() => "?").join(", ")
      const imageRows = db.all(
        `SELECT image_id, page_id, width, height, source FROM images
         WHERE image_id IN (${placeholders}) AND source != 'translate'
         ORDER BY page_id, image_id`,
        Array.from(captionedIds.keys())
      ) as Array<{
        image_id: string
        page_id: string
        width: number
        height: number
        source: string
      }>

      return c.json({
        images: imageRows.map((r) => ({
          imageId: r.image_id,
          pageId: r.page_id,
          width: r.width,
          height: r.height,
          source: r.source,
          caption: captionedIds.get(r.image_id) ?? "",
        })),
      })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/translated-images — List localized image variants
  // produced by the image-translation step. Each row maps a source image
  // (the original) to its translated variant for a specific language.
  app.get("/books/:label/translated-images", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const db = openBookDb(dbPath)
    try {
      const rows = db.all(
        "SELECT image_id, page_id, width, height FROM images WHERE source = 'translate' ORDER BY image_id"
      ) as Array<{ image_id: string; page_id: string; width: number; height: number }>

      // image_id format: `${sourceImageId}_tr_${language}`
      const images = rows.flatMap((r) => {
        const match = r.image_id.match(/^(.+)_tr_([a-zA-Z0-9_-]+)$/)
        if (!match) return []
        return [{
          imageId: r.image_id,
          sourceImageId: match[1],
          language: match[2],
          pageId: r.page_id,
          width: r.width,
          height: r.height,
        }]
      })

      return c.json({ images })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/cover — Serve the first extracted page image (book cover)
  app.get("/books/:label/cover", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    // Fallback for books with no extracted cover yet (e.g. a freshly-split
    // shell): render page 1 straight from the source PDF, like the import
    // preview does. Returns the response, or 404 if there's no usable PDF.
    const pdfPath = path.join(bookDir, `${safeLabel}.pdf`)
    const servePdfCover = () => {
      if (!fs.existsSync(pdfPath)) {
        throw new HTTPException(404, { message: "No cover available" })
      }
      const cover = renderPdfCover(fs.readFileSync(pdfPath), { maxWidth: 320 })
      if (!cover) {
        throw new HTTPException(404, { message: "No cover available" })
      }
      c.header("Content-Type", "image/png")
      c.header("Cache-Control", "public, max-age=86400")
      return c.body(new Uint8Array(cover))
    }

    if (!fs.existsSync(dbPath)) {
      return servePdfCover()
    }

    const db = openBookDb(dbPath)
    try {
      const metadataRow = db.all(
        `SELECT data FROM node_data
         WHERE node = 'metadata' AND item_id = 'book'
         ORDER BY version DESC LIMIT 1`
      ) as Array<{ data: string }>

      let coverPageNumber: number | null = null
      if (metadataRow.length > 0) {
        try {
          const parsed = JSON.parse(metadataRow[0].data) as {
            cover_page_number?: number | null
          }
          if (typeof parsed.cover_page_number === "number") {
            coverPageNumber = parsed.cover_page_number
          }
        } catch { /* ignore malformed metadata */ }
      }

      const pageRows =
        coverPageNumber !== null
          ? (db.all(
              "SELECT page_id FROM pages WHERE page_number = ? LIMIT 1",
              [coverPageNumber]
            ) as Array<{ page_id: string }>)
          : (db.all(
              "SELECT page_id FROM pages ORDER BY page_number ASC LIMIT 1"
            ) as Array<{ page_id: string }>)

      if (pageRows.length === 0) {
        return servePdfCover()
      }

      const imageId = `${pageRows[0].page_id}_page`
      const imageRows = db.all(
        "SELECT path FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ path: string }>

      if (imageRows.length === 0) {
        return servePdfCover()
      }

      const imagePath = path.resolve(bookDir, imageRows[0].path)
      if (!imagePath.startsWith(bookDir + path.sep)) {
        throw new HTTPException(400, { message: "Invalid image path" })
      }

      let stat: fs.Stats
      try {
        stat = fs.statSync(imagePath)
      } catch {
        throw new HTTPException(404, { message: "Cover image file not found" })
      }
      if (!stat.isFile()) {
        throw new HTTPException(404, { message: "Cover image file not found" })
      }

      const imageBuffer = fs.readFileSync(imagePath)
      const ext = path.extname(imagePath).toLowerCase()
      const contentType =
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png"
      c.header("Content-Type", contentType)
      c.header("Cache-Control", "public, max-age=86400")
      return c.body(imageBuffer)
    } finally {
      db.close()
    }
  })

  // GET /books/:label/images/:imageId — Serve extracted image binary
  app.get("/books/:label/images/:imageId", (c) => {
    const { label, imageId } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
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
      const rows = db.all(
        "SELECT path, hash FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ path: string; hash: string }>

      if (rows.length === 0) {
        throw new HTTPException(404, {
          message: `Image not found: ${imageId}`,
        })
      }

      const imagePath = path.resolve(bookDir, rows[0].path)
      // Verify path doesn't escape book directory and stays within a descendant path.
      if (!imagePath.startsWith(bookDir + path.sep)) {
        throw new HTTPException(400, { message: "Invalid image path" })
      }
      let stat: fs.Stats
      try {
        stat = fs.statSync(imagePath)
      } catch {
        throw new HTTPException(404, {
          message: `Image file not found: ${imageId}`,
        })
      }
      if (!stat.isFile()) {
        throw new HTTPException(404, {
          message: `Image file not found: ${imageId}`,
        })
      }

      // Extract reruns intentionally reuse stable image IDs while replacing
      // their bytes. Require revalidation so Chromium cannot show a previous
      // extraction for up to 24 hours under the same URL.
      c.header("Cache-Control", "private, no-cache")
      if (rows[0].hash) {
        const etag = `"${rows[0].hash}"`
        c.header("ETag", etag)
        if (c.req.header("If-None-Match") === etag) {
          return c.body(null, 304)
        }
      }

      const imageBuffer = fs.readFileSync(imagePath)
      const ext = path.extname(imagePath).toLowerCase()
      const contentType =
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png"
      c.header("Content-Type", contentType)
      return c.body(imageBuffer)
    } finally {
      db.close()
    }
  })

  // GET /books/:label/adt/* — Serve packaged ADT static files
  // Supports an optional cache-bust version segment: /adt/v-{ts}/page.html
  // The version segment is stripped before resolving files, so all relative
  // URLs (pages, assets, content) carry the same bust automatically.
  // When no file path is given, redirect to the first page.
  app.get("/books/:label/adt/*", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const adtDir = resolvePathWithin(booksDir, safeLabel, "adt")
    if (!adtDir) throw new HTTPException(400, { message: "Invalid path" })
    publishedAdtDirectory(path.dirname(adtDir))
    if (!fs.existsSync(adtDir)) {
      throw new HTTPException(404, {
        message: `ADT not packaged for book: ${safeLabel}`,
      })
    }

    // Extract file path from URL — c.req.param("*") is unreliable in sub-routers
    const adtPrefix = `/books/${safeLabel}/adt/`
    const reqPath = c.req.path
    const prefixIdx = reqPath.indexOf(adtPrefix)
    let filePath = prefixIdx >= 0 ? reqPath.slice(prefixIdx + adtPrefix.length) : ""

    // Strip optional cache-bust version segment (e.g. "v-1708300000000/" or "v-1708300000000")
    filePath = filePath.replace(/^v-[^/]+\/?/, "")

    const resolvedPath = resolvePathWithin(adtDir, filePath)
    const pagesPath = resolvePathWithin(adtDir, "content", "pages.json")
    if (!resolvedPath || !pagesPath) throw new HTTPException(400, { message: "Invalid path" })
    if (!fs.existsSync(pagesPath) || !fs.existsSync(resolvedPath)) throw new HTTPException(404, { message: "Not found" })
    // Authorize the member whose bytes will be read, including a contained
    // symlink or a trailing slash that resolves to a regular file.
    filePath = path.relative(fs.realpathSync(adtDir), fs.realpathSync(resolvedPath)).split(path.sep).join("/")
    const dbPath = resolvePathWithin(booksDir, safeLabel, safeLabel + ".db")
    if (!dbPath) throw new HTTPException(400, { message: "Invalid path" })
    if (!fs.existsSync(dbPath)) throw new HTTPException(404, { message: "Book not found" })
    const storage = createBookStorage(safeLabel, booksDir)
    let ownership
    try { ownership = readPackageOwners(storage, dbPath, adtDir) }
    finally { storage.close() }
    // A version segment busts caches; it does not establish current ownership.
    // In particular the offline preloader contains copies of *all* page HTML.
    // If any member lost its owner, serve healthy pages via the live reader and
    // never provide that old package's shared content, script or entry redirect.
    c.header("Cache-Control", "no-store")
    if (!ownership.allOwned) {
      const target = !filePath || filePath === "index.html"
        ? ownership.entries[0]?.href ?? (ownership.current.size ? ownership.current.keys().next().value + ".html" : undefined)
        : filePath
      if (!target || (target.endsWith(".html") && !ownership.current.has(target.slice(0, -5)))) {
        throw new HTTPException(404, { message: "Not found" })
      }
      return c.redirect(`/api/books/${safeLabel}/adt-preview/${target}${new URL(c.req.url).search}`, 307)
    }
    if (!filePath) {
      const version = reqPath.match(/\/adt\/(v-[^/]+)/)?.[1]
      return c.redirect(`/api/books/${safeLabel}/adt/${version ? version + "/" : ""}${ownership.entries[0].href}`)
    }
    if (filePath.toLowerCase().endsWith(".html") && filePath !== "index.html" && filePath !== "content/navigation/nav.html" &&
        !ownership.entries.some(entry => entry.href === filePath)) throw new HTTPException(404, { message: "Not found" })

    let stat: fs.Stats
    try {
      stat = fs.statSync(resolvedPath)
    } catch {
      throw new HTTPException(404, { message: `Not found: ${filePath}` })
    }
    if (!stat.isFile()) {
      throw new HTTPException(404, { message: `Not found: ${filePath}` })
    }

    const ext = path.extname(resolvedPath).toLowerCase()
    const memberDigest = ownership.memberDigests.get(filePath)
    c.header("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream")
    if (ext !== ".html" && !filePath.toLowerCase().endsWith(".html") && !memberDigest) {
      // Revalidate every use after database admission and current ownership.
      // The URL's version segment is not proof; the validator names actual
      // bytes, including edits made without changing the package version.
      const asset = readPreviewAsset(resolvedPath, c.req.header("If-None-Match"))
      c.header("Cache-Control", "private, no-cache")
      c.header("ETag", asset.etag)
      return asset.bytes ? c.body(asset.bytes) : c.body(null, 304)
    }
    const fileBuffer = fs.readFileSync(resolvedPath)
    if (memberDigest && createHash("sha256").update(fileBuffer).digest("hex") !== memberDigest) {
      return c.redirect(`/api/books/${safeLabel}/adt-preview/${filePath}${new URL(c.req.url).search}`, 307)
    }
    return c.body(fileBuffer)
  })

  return app
}
