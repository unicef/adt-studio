import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
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

  return app
}
