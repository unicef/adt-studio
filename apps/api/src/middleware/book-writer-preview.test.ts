import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { pathToFileURL } from "node:url"
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

it("compiles preview styles during another page's run without granting writer authority", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-css-reader-"))
  const label = "css-book"
  createBookStorage(label, root).close()
  const bookDir = path.join(root, label)
  const database = path.join(bookDir, `${label}.db`)
  const before = fs.readFileSync(database)
  const app = new Hono().onError(errorHandler)
    .use("/books/:label/*", bookWriterMiddleware(root))
    .route("/", createAdtPreviewRoutes(root, root))
    .route("/", createBookRoutes(root))
  let release!: () => void
  const held = withBookWriter(bookDir, async () => {
    // The actual running page owns a connection. CSS may borrow a reader pin,
    // but its separate HTTP scope must not acquire that writer's authority.
    const writerStorage = createBookStorage(label, root)
    try { await new Promise<void>(resolve => { release = resolve }) }
    finally { writerStorage.close() }
  })
  const send = (suffix: string, body: unknown, method = "POST") => app.request(`/books/${label}/${suffix}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  try {
    const lease = fs.readFileSync(path.join(bookDir, ".book-writer.json"))
    const css = await send("adt-preview/content/tailwind_output.css", { extraHtml: '<p class="text-[#123abc]">Committed content</p>' })
    expect(css.status).toBe(200)
    expect(await css.text()).toContain("#123abc")
    expect((await send("config", { config: { concurrency: 2 } }, "PUT")).status).toBe(409)
    expect(fs.existsSync(path.join(bookDir, "config.yaml"))).toBe(false)
    expect(fs.readFileSync(database).equals(before)).toBe(true)
    expect(fs.readFileSync(path.join(bookDir, ".book-writer.json")).equals(lease)).toBe(true)
  } finally { release(); await held }
  try {
    expect((await send("config", { config: { concurrency: 2 } }, "PUT")).status).toBe(200)
    expect((await app.request("/books/missing/adt-preview/content/tailwind_output.css", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extraHtml: "<p>x</p>" }),
    })).status).toBe(404)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})


it("keeps stylesheet database reads subject to a foreign process reader lease", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-css-foreign-"))
  const label = "foreign-book"
  createBookStorage(label, root).close()
  const bookDir = path.join(root, label)
  const database = path.join(bookDir, `${label}.db`)
  const before = fs.readFileSync(database)
  const storageModule = pathToFileURL(path.resolve("packages/storage/dist/index.js")).href
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createBookStorage } from ${JSON.stringify(storageModule)};
    const storage = createBookStorage(${JSON.stringify(label)}, ${JSON.stringify(root)});
    process.stdout.write("ready");
    process.stdin.once("data", () => { storage.close(); process.exit(0); });
  `], { stdio: ["pipe", "pipe", "pipe"] })
  const exited = once(child, "exit")
  const app = new Hono().onError(errorHandler)
    .use("/books/:label/*", bookWriterMiddleware(root))
    .route("/", createAdtPreviewRoutes(root, root))
  const send = () => app.request(`/books/${label}/adt-preview/content/tailwind_output.css`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extraHtml: '<p class="text-[#456def]">Retained content</p>' }),
  })
  try {
    const ready = await Promise.race([once(child.stdout, "data"), exited.then(() => { throw new Error("Reader exited before admission") })])
    expect(String(ready[0])).toBe("ready")
    const lease = fs.readFileSync(path.join(bookDir, ".book-writer.json"))
    const blocked = await send()
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toMatchObject({ code: "BOOK_BUSY" })
    expect(fs.readFileSync(database).equals(before)).toBe(true)
    expect(fs.readFileSync(path.join(bookDir, ".book-writer.json")).equals(lease)).toBe(true)
  } finally {
    child.stdin.end("release")
    await exited
  }
  try {
    const next = await send()
    expect(next.status).toBe(200)
    expect(await next.text()).toContain("#456def")
    expect(fs.readFileSync(database).equals(before)).toBe(true)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
