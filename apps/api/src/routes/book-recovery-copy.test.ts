import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { afterEach, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { BOOK_RECOVERY_PENDING_FILE } from "@adt/types"
import { createBookRoutes } from "./books.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
it("RAC-18: exposes explicit copy recovery through both API admission layers and keeps the original busy", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-copy-route-")); roots.push(root)
  const config = path.join(root, "config.yaml"); fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\n")
  const storage = createBookStorage("original", root); storage.close()
  const lock = path.join(root, "original", ".book-writer.json")
  const owner = JSON.stringify({ token: randomUUID(), pid: 1, host: "other-machine" })
  fs.writeFileSync(lock, owner)
  const app = new Hono().onError(errorHandler)
  app.use("/api/books/:label/*", bookWriterMiddleware(root))
  app.route("/api", createBookRoutes(root, undefined, config))
  expect((await app.request("/api/books/original")).status).toBe(409)
  const send = (data: unknown) => app.request("/api/books/original/recover-copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
  expect((await send({ label: "copy" })).status).toBe(400)
  expect((await send({ label: "../escape", preserveOriginal: true })).status).toBe(400)
  expect((await send({ label: "copy", preserveOriginal: true })).status).toBe(201)
  expect((await app.request("/api/books/copy")).status).toBe(200)
  expect((await app.request("/api/books/original")).status).toBe(409)
  expect(fs.readFileSync(lock, "utf8")).toBe(owner)
  // A crash/interruption cannot advertise a partial destination in Library.
  fs.writeFileSync(path.join(root, "copy", BOOK_RECOVERY_PENDING_FILE), "interrupted")
  expect((await app.request("/api/books/copy")).status).toBe(409)
  expect((await app.request("/api/books/copy", { method: "DELETE" })).status).toBe(409)
  const books = await (await app.request("/api/books")).json()
  expect(books.map((book: { label: string }) => book.label)).toEqual(["original"])
})
