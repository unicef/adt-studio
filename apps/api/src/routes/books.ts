import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel, PIPELINE } from "@adt/types"
import { openBookDb } from "@adt/storage"
import {
  listBooks,
  getBook,
  createBook,
  deleteBook,
  getBookConfig,
  updateBookConfig,
  acceptStoryboard,
} from "../services/book-service.js"
import { exportBook } from "../services/export-service.js"
import { exportBookEpub } from "../services/epub-service.js"

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

  // POST /books/:label/accept-storyboard — Accept the storyboard
  app.post("/books/:label/accept-storyboard", (c) => {
    const { label } = c.req.param()
    try {
      const result = acceptStoryboard(label, booksDir)
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) {
        throw new HTTPException(404, { message })
      }
      throw new HTTPException(400, { message })
    }
  })

  // GET /books/:label/step-status — Which pipeline steps are complete
  app.get("/books/:label/step-status", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const resolvedDir = path.resolve(booksDir)
    const dbPath = path.join(resolvedDir, safeLabel, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      return c.json({ steps: {}, completedNodes: [] })
    }

    const db = openBookDb(dbPath)
    try {
      // Read explicit step completion records (populated by the step runner)
      const rows = db.all("SELECT step FROM step_completions") as Array<{ step: string }>
      const completedSteps = new Set(rows.map((r) => r.step))

      // A stage is complete when ALL its steps are complete
      const steps: Record<string, boolean> = {}
      for (const stage of PIPELINE) {
        if (stage.steps.length === 0) continue
        if (stage.steps.every((s) => completedSteps.has(s.name))) {
          steps[stage.name] = true
        }
      }

      // Check if ADT is packaged (preview step)
      const adtDir = path.join(resolvedDir, safeLabel, "adt")
      if (fs.existsSync(adtDir)) steps.preview = true

      return c.json({ steps, completedNodes: [...completedSteps] })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/export — Download book as ZIP or EPUB
  app.get("/books/:label/export", async (c) => {
    const { label } = c.req.param()
    const format = c.req.query("format") ?? "web"
    if (format !== "web" && format !== "epub") {
      throw new HTTPException(400, { message: `Invalid format: ${format}. Must be "web" or "epub".` })
    }
    try {
      const result = format === "epub"
        ? await exportBookEpub(label, booksDir, configPath)
        : await exportBook(label, booksDir, webAssetsDir ?? "", configPath)
      const contentType = format === "epub" ? "application/epub+zip" : "application/zip"
      c.header("Content-Type", contentType)
      c.header(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`
      )
      return c.body(Buffer.from(result.zipBuffer))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("not found")) {
        throw new HTTPException(404, { message })
      }
      throw new HTTPException(400, { message })
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
