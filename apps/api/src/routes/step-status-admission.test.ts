import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const admission = vi.hoisted(() => ({ closes: [] as Array<ReturnType<typeof vi.fn>> }))
vi.mock("@adt/storage", async original => {
  const real = await original<typeof import("@adt/storage")>()
  return { ...real, createBookStorage: (...args: Parameters<typeof real.createBookStorage>) => {
    const storage = real.createBookStorage(...args)
    admission.closes.push(vi.spyOn(storage, "close"))
    return storage
  } }
})
import { createBookStorage, withBookWriter } from "@adt/storage"
import { createStageRoutes } from "./stages.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createBookEventBus } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { createStageService } from "../services/stage-service.js"

let root: string
let config: string
let app: Hono
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "step-status-admission-"))
  config = path.join(root, "config.yaml")
  fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\n")
  const storage = createBookStorage("book", root)
  storage.putNodeData("page-sectioning", "pg001", { sections: [], source: "manual" })
  storage.close()
  admission.closes.length = 0
  const bus = createBookEventBus()
  const decisions = createPageErrorDecisions(bus)
  const service = createStageService({ run: vi.fn(async () => undefined) }, bus, decisions)
  app = new Hono().onError(errorHandler).route("/", createStageRoutes(service, bus, decisions, root, root, root, config))
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

it("uses one admitted connection for the whole status response and releases it before the next writer", async () => {
  const response = await app.request("/books/book/step-status")
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ stages: { sectioning: "idle" }, protectedWork: [], runStatus: "idle" })
  expect(admission.closes).toHaveLength(1)
  expect(admission.closes[0]).toHaveBeenCalledTimes(1)
  expect(withBookWriter(path.join(root, "book"), () => "admitted")).toBe("admitted")
  expect(fs.existsSync(path.join(root, "book", ".book-writer.json"))).toBe(false)
})

it("releases the admitted connection when a later config read refuses the request", async () => {
  fs.writeFileSync(path.join(root, "book", "config.yaml"), "concurrency: not-a-number\n")
  const response = await app.request("/books/book/step-status")
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "BOOK_CONFIG_INVALID" })
  expect(admission.closes).toHaveLength(1)
  expect(admission.closes[0]).toHaveBeenCalledTimes(1)
  expect(withBookWriter(path.join(root, "book"), () => "admitted")).toBe("admitted")
})

it("keeps the existing no-database status without creating a book or connection", async () => {
  const response = await app.request("/books/missing/step-status")
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ protectedWork: [], stages: { sectioning: "idle" } })
  expect(admission.closes).toHaveLength(0)
  expect(fs.existsSync(path.join(root, "missing"))).toBe(false)
})

it("retains foreign-owner refusal and leaves the database and lease unchanged", async () => {
  const dir = path.join(root, "book")
  const database = path.join(dir, "book.db")
  const before = fs.readFileSync(database)
  const lease = JSON.stringify({ token: randomUUID(), host: "another-host", pid: process.pid })
  fs.writeFileSync(path.join(dir, ".book-writer.json"), lease)
  const response = await app.request("/books/book/step-status")
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "BOOK_BUSY" })
  expect(admission.closes).toHaveLength(0)
  expect(fs.readFileSync(database).equals(before)).toBe(true)
  expect(fs.readFileSync(path.join(dir, ".book-writer.json"), "utf8")).toBe(lease)
})
