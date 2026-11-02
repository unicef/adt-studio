import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { expect, it } from "vitest"
import { createBookStorage, withBookWriter } from "@adt/storage"
import { createAdtPreviewRoutes } from "../routes/adt-preview.js"
import { createBookRoutes } from "../routes/books.js"
import { bookWriterMiddleware } from "./book-writer.js"
import { errorHandler } from "./error-handler.js"

it("converts committed-page math during another page's run without admitting a configuration writer", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-reader-"))
  const label = "math-book"
  const storage = createBookStorage(label, root)
  storage.close()
  const bookDir = path.join(root, label)
  const database = path.join(bookDir, `${label}.db`)
  const before = fs.readFileSync(database)
  const app = new Hono().onError(errorHandler)
    .use("/books/:label/*", bookWriterMiddleware(root))
    .route("/", createAdtPreviewRoutes(root, root))
    .route("/", createBookRoutes(root))
  const send = (suffix: string, body: unknown, method = "POST") => app.request(`/books/${label}/${suffix}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  let release!: () => void
  const held = withBookWriter(bookDir, () => new Promise<void>(resolve => { release = resolve }))
  try {
    const lease = fs.readFileSync(path.join(bookDir, ".book-writer.json"))
    const converted = await send("adt-preview/convert-math", { html: "<p>\\(x^2\\)</p>" })
    expect(converted.status).toBe(200)
    expect((await converted.json()).html).toContain("<math")
    const blocked = await send("config", { config: { page_sectioning: { mode: "page" } } }, "PUT")
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toMatchObject({ code: "BOOK_BUSY" })
    expect(fs.existsSync(path.join(bookDir, "config.yaml"))).toBe(false)
    expect(fs.readFileSync(database).equals(before)).toBe(true)
    expect(fs.readFileSync(path.join(bookDir, ".book-writer.json")).equals(lease)).toBe(true)
  } finally { release(); await held }
  try {
    expect((await send("config", { config: { page_sectioning: { mode: "page" } } }, "PUT")).status).toBe(200)
    expect((await app.request("/books/missing/adt-preview/convert-math", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: "<p>x</p>" }),
    })).status).toBe(404)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
