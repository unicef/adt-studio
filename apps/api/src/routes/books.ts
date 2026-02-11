import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
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

export function createBookRoutes(booksDir: string): Hono {
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

  // GET /books/:label/export — Download book as ZIP
  app.get("/books/:label/export", (c) => {
    const { label } = c.req.param()
    try {
      const result = exportBook(label, booksDir)
      c.header("Content-Type", "application/zip")
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

  // GET /books/:label/images/:imageId — Serve extracted image as PNG
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
      c.header("Content-Type", "image/png")
      c.header("Cache-Control", "public, max-age=86400")
      return c.body(imageBuffer)
    } finally {
      db.close()
    }
  })

  return app
}
