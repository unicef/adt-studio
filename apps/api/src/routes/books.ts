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
} from "../services/book-service.js"

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

  return app
}
