import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { runFullPipeline } from "@adt/pipeline"
import { setupFullResumeFixture } from "../../../../packages/pipeline/src/__tests__/fixtures/full-resume.js"
const repository = path.resolve(import.meta.dirname, "../../../..")
const label = "book"
let root: string
let transport: ReturnType<typeof setupFullResumeFixture>["transport"]
let options: ReturnType<typeof setupFullResumeFixture>["options"]
let storage: ReturnType<typeof setupFullResumeFixture>["storage"]
let histories: ReturnType<typeof setupFullResumeFixture>["histories"]
let errors: ReturnType<typeof setupFullResumeFixture>["errors"]
beforeEach(() => { ({ root, transport, options, storage, histories, errors } = setupFullResumeFixture()) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }) })
it("HTTP full Extract and a duplicate queued request share current-output reuse", { timeout: 120000 }, async () => {
  const { Hono } = await import("hono")
  const { createStageRoutes } = await import("./stages.js")
  const { createStageService } = await import("../services/stage-service.js")
  const { createBookEventBus } = await import("../services/book-event-bus.js")
  const { createPageErrorDecisions } = await import("../services/page-error-decisions.js")
  const { createStageRunner } = await import("../services/stage-runner.js")
  const { errorHandler } = await import("../middleware/error-handler.js")
  fs.cpSync(path.join(repository, "templates"), path.join(root, "templates"), { recursive: true })
  const full = { ...options(), templatesDir: path.join(root, "templates"), toStage: "package" as const, webAssetsDir: path.join(repository, "assets/adt") }
  expect(errors(await runFullPipeline(full))).toEqual([])
  const before = histories(), calls = transport.mock.calls.length
  const bus = createBookEventBus(), decisions = createPageErrorDecisions(bus), service = createStageService(createStageRunner(), bus, decisions)
  const app = new Hono(); app.onError(errorHandler)
  app.route("/", createStageRoutes(service, bus, decisions, full.booksRoot, full.promptsDir, full.webAssetsDir, full.configPath))
  const request = () => app.request(`/books/${label}/stages/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromStage: "extract", toStage: "package" }) })
  expect((await request()).status).toBe(200)
  const duplicate = await request()
  expect(duplicate.status).toBe(200)
  await vi.waitFor(() => {
    expect(service.getStatus(label).queue).toHaveLength(0)
    expect(service.getStatus(label).active).toBeNull()
  }, { timeout: 30000 })
  expect(service.getStatus(label).summary?.status).toBe("complete")
  expect(transport).toHaveBeenCalledTimes(calls)
  expect(histories()).toEqual(before)
})

it("Studio keep decisions are content-bound; informational preferences do not gate usable content", { timeout: 60000 }, async () => {
  const { Hono } = await import("hono")
  const { createOutputRoutes } = await import("./outputs.js")
  const { bookWriterMiddleware } = await import("../middleware/book-writer.js")
  const { errorHandler } = await import("../middleware/error-handler.js")
  const { writeSectioningLifecycle } = await import("@adt/storage")
  fs.cpSync(path.join(repository, "templates"), path.join(root, "templates"), { recursive: true })
  const full = { ...options(), templatesDir: path.join(root, "templates") }
  expect(errors(await runFullPipeline(full))).toEqual([])
  const s = storage(), row = s.getLatestNodeData("web-rendering", "pg001")!
  s.putNodeData("web-rendering", "pg001", { ...(row.data as object), source: "manual" })
  const app = new Hono(); app.onError(errorHandler)
  app.use("/books/:label/*", bookWriterMiddleware(full.booksRoot))
  app.route("/", createOutputRoutes(full.booksRoot, full.promptsDir, full.configPath))
  const read = async () => (await (await app.request("/books/book/outputs")).json()).outputs.find((output: { identity: { kind: string } }) => output.identity.kind === "storyboard")
  const output = await read(), history = s.getAllNodeVersions("web-rendering", "pg001")
  const keep = () => app.request("/books/book/outputs/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: output.identity, signature: output.signature, contentHash: output.contentHash, revision: output.revision, action: "keep" }) })
  writeSectioningLifecycle(s.bookDir!, "page", true, true)
  expect((await keep()).status).toBe(200)
  expect(await read()).toMatchObject({ current: true, protected: true, manual: true })
  s.putNodeData("web-rendering", "pg001", { ...(row.data as object), source: "manual", correction: "Newer edit" })
  expect((await keep()).status).toBe(409)
  s.close()
})
