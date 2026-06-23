import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel, PIPELINE, BookMetadata } from "@adt/types"
import { openBookDb, createBookStorage } from "@adt/storage"
import { countPdfPages } from "@adt/pdf"
import { normalizeLocale, getBaseLanguage } from "@adt/pipeline"
import {
  listBooks,
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
  type ExportFeatures,
  type ExportDefaultSettings,
  type ExportResult,
} from "../services/export-service.js"
import { importProject, previewImport } from "../services/import-service.js"
import type { TaskService } from "../services/task-service.js"

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
): Hono {
  const app = new Hono()

  app.get("/books", (c) => {
    const books = listBooks(booksDir)
    return c.json(books)
  })

  app.get("/books/:label", (c) => {
    const { label } = c.req.param()
    try {
      const book = getBook(label, booksDir)
      return c.json(book)
    } catch (err) {
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
    const preview = previewImport(zipBuffer)
    return c.json(preview)
  })

  app.post("/books/import", async (c) => {
    const formData = await c.req.formData()
    const zip = formData.get("zip")

    if (!(zip instanceof File)) {
      throw new HTTPException(400, { message: "zip file is required" })
    }

    const zipBuffer = Buffer.from(await zip.arrayBuffer())
    const book = await importProject(zipBuffer, booksDir)
    return c.json(book, 201)
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
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) {
        throw new HTTPException(404, { message })
      }
      throw new HTTPException(400, { message })
    }
  })

  // PUT /books/:label/config — Update book-level config overrides
  app.put("/books/:label/config", async (c) => {
    const { label } = c.req.param()
    const body = await c.req.json<{ config: Record<string, unknown> }>()

    if (!body.config || typeof body.config !== "object") {
      throw new HTTPException(400, { message: "config object is required" })
    }

    try {
      updateBookConfig(label, booksDir, body.config)
      const updated = getBookConfig(label, booksDir)
      return c.json({ config: updated ?? {} })
    } catch (err) {
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
      // A base-language change (es -> fr) also needs the book summary
      // regenerated; the client triggers that via the book-summary regenerate
      // endpoint (which keeps the existing summary visible until it lands)
      // rather than clearing it here, so the Extract stage isn't reset.
      const baseLanguageChanged =
        getBaseLanguage(prevLanguage) !== getBaseLanguage(nextLanguage)

      const version = storage.putNodeData("metadata", "book", parsed.data)

      if (languageChanged) {
        // The detected language drives the editing language used by every
        // language-dependent step downstream of Storyboard (captions, quizzes,
        // glossary, ToC, easy read, translation, speech, packaging). Clearing
        // these mirrors a "re-run from Storyboard" cascade. Sectioning and
        // Storyboard themselves (page structure, rendering) are language-agnostic
        // and intentionally preserved, along with manual section edits.
        storage.clearNodesByType([
          "quiz-generation",
          "image-captioning",
          "glossary",
          "toc-generation",
          "text-catalog",
          "easy-read",
          "text-catalog-translation",
          "tts",
          "tts-timestamps",
          "accessibility-assessment",
        ])
        storage.clearStepRuns([
          "quiz-generation",
          "image-captioning",
          "glossary",
          "toc-generation",
          "text-catalog",
          "easy-read",
          "catalog-translation",
          "image-translation",
          "tts",
          "word-timestamps",
          "package-web",
          "accessibility-assessment",
        ])
        // Language-specific translated image variants live in the images table.
        storage.clearTranslatedImages()
      } else {
        // Title/authors/publisher only feed packaging metadata.
        storage.clearStepRuns(["package-web"])
      }

      return c.json({ version, languageChanged, baseLanguageChanged })
    } finally {
      storage.close()
    }
  })

  // NOTE: step-status endpoint is now in stages.ts (needs StageService for run state)

  // POST /books/:label/prepare-export — Rebuild adt/ (and webpub/ if needed) before download
  app.post("/books/:label/prepare-export", async (c) => {
    const { label } = c.req.param()
    const format = (c.req.query("format") ?? "project") as "project" | "webpub" | "scorm" | "adt" | "epub"
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
        async () => {
          await prepareExport(label, format, booksDir, webAssetsDir ?? "", configPath, features, defaultSettings)
        },
        { url: `/books/${safeLabel}/export-${format}` }
      )
      return c.json({ status: "submitted", taskId, label: safeLabel })
    }

    await prepareExport(label, format, booksDir, webAssetsDir ?? "", configPath, features, defaultSettings)
    return c.json({ status: "completed", label: safeLabel })
  })

  // Export download routes — each format delegates to its service function,
  // then streams the ZIP with RFC 5987 Content-Disposition headers.
  const exportHandlers: Record<string, (label: string, dir: string) => Promise<ExportResult>> = {
    "export-project": exportProject,
    "export-webpub": exportWebpub,
    "export-scorm": exportScorm,
    "export-adt": exportAdt,
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
      const captionRows = db.all(
        `SELECT data FROM node_data
         WHERE node = 'image-captioning'
         AND (node, item_id, version) IN (
           SELECT node, item_id, MAX(version) FROM node_data
           WHERE node = 'image-captioning'
           GROUP BY node, item_id
         )`
      ) as Array<{ data: string }>

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

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
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
        throw new HTTPException(404, { message: "No pages extracted yet" })
      }

      const imageId = `${pageRows[0].page_id}_page`
      const imageRows = db.all(
        "SELECT path FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ path: string }>

      if (imageRows.length === 0) {
        throw new HTTPException(404, { message: "Cover image not found" })
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
        "SELECT path FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ path: string }>

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
    const adtDir = path.join(path.resolve(booksDir), safeLabel, "adt")
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

    if (!filePath) {
      // Root request — redirect to first page
      const pagesPath = path.join(adtDir, "content", "pages.json")
      if (!fs.existsSync(pagesPath)) {
        throw new HTTPException(404, {
          message: `ADT not packaged for book: ${safeLabel}`,
        })
      }
      const pages = JSON.parse(fs.readFileSync(pagesPath, "utf-8")) as Array<{ href: string }>
      if (pages.length === 0) {
        throw new HTTPException(404, { message: "ADT has no pages" })
      }
      // Preserve the version segment in the redirect
      const versionMatch = reqPath.match(/\/adt\/(v-[^/]+)/)
      const versionPrefix = versionMatch ? `${versionMatch[1]}/` : ""
      return c.redirect(`/api/books/${safeLabel}/adt/${versionPrefix}${pages[0].href}`)
    }

    const resolvedPath = path.resolve(adtDir, filePath)
    if (!resolvedPath.startsWith(adtDir + path.sep)) {
      throw new HTTPException(400, { message: "Invalid path" })
    }

    let stat: fs.Stats
    try {
      stat = fs.statSync(resolvedPath)
    } catch {
      throw new HTTPException(404, { message: `Not found: ${filePath}` })
    }
    if (!stat.isFile()) {
      throw new HTTPException(404, { message: `Not found: ${filePath}` })
    }

    const fileBuffer = fs.readFileSync(resolvedPath)
    const ext = path.extname(resolvedPath).toLowerCase()
    c.header("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream")
    // Cache indefinitely — the iframe URL includes a cache-busting version
    // segment (v-{timestamp}) that changes on every repackage.
    c.header("Cache-Control", "public, max-age=31536000, immutable")
    return c.body(fileBuffer)
  })

  return app
}
