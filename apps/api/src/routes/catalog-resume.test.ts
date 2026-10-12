import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, writeSectioningLifecycle } from "@adt/storage"
import { extractPDF } from "@adt/pipeline"
import { createStageRunner } from "../services/stage-runner.js"
import { createStageService } from "../services/stage-service.js"
import { createBookEventBus, type BookSSEEvent } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { createStageRoutes } from "./stages.js"
import { errorHandler } from "../middleware/error-handler.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"

const repository = path.resolve(import.meta.dirname, "../../../..")
let root: string
const label = "book"
const transport = vi.fn<typeof fetch>()
const events: BookSSEEvent[] = []
const storage = () => createBookStorage(label, path.join(root, "books"))
const configPath = () => path.join(root, "config.yaml")
let app: Hono
let service: ReturnType<typeof createStageService>
const post = (body = {}) => app.request(`/books/${label}/stages/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromStage: "translate", toStage: "translate", resume: true, ...body }) })
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "api-catalog-resume-"))
  fs.mkdirSync(path.join(root, "prompts")); fs.mkdirSync(path.join(root, "config"))
  fs.writeFileSync(configPath(), "role_types: {}\nstructure_types: {}\nstart_page: 1\nend_page: 1\ndefault_model: ollama:tinyllama\noutput_languages: [fr-FR]\n")
  fs.writeFileSync(path.join(root, "prompts/translation.liquid"), '{% chat role: "user" %}{% for t in texts %}TEXT|{{ t.text }}\n{% endfor %}{% endchat %}')
  fs.writeFileSync(path.join(root, "prompts/core_tts_preparation.liquid"), '{% chat role: "user" %}{{ entries }}{% endchat %}')
  const s = storage()
  await extractPDF({ pdfPath: path.join(repository, "tests/fixtures/raven.pdf"), startPage: 1, endPage: 1 }, s, { emit() {} })
  s.putNodeData("metadata", "book", { language_code: "en" })
  s.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html: '<p data-id="a">Hello</p>' }] }); s.close()
  writeSectioningLifecycle(path.join(root, "books", label), "dynamic", true)
  const bus = createBookEventBus(), decisions = createPageErrorDecisions(bus)
  events.length = 0; bus.addListener(label, (event) => events.push(event))
  service = createStageService(createStageRunner(), bus, decisions)
  app = new Hono(); app.onError(errorHandler)
  app.use("/books/:label/*", bookWriterMiddleware(path.join(root, "books")))
  app.route("/", createStageRoutes(service, bus, decisions, path.join(root, "books"), path.join(root, "prompts"), "", configPath()))
  transport.mockReset().mockImplementation(async () => Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ translations: ["Bonjour"] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  vi.stubGlobal("fetch", transport)
})
afterEach(async () => {
  await vi.waitFor(() => expect(service.getStatus(label).active?.status).not.toBe("running"))
  vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true })
})

it("reassesses duplicate queued work, returns persisted outcome through HTTP and emits no second provider call", async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const response = transport.getMockImplementation()!
  transport.mockImplementation(async (...args) => { await held; return response(...args) })
  expect((await post()).status).toBe(200)
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
  expect(await (await post()).json()).toMatchObject({ status: "queued" })
  release()
  await vi.waitFor(() => expect(events.filter((event) => event.type === "stage-run-complete")).toHaveLength(2), { timeout: 10_000 })
  expect(transport).toHaveBeenCalledTimes(1)
  const result = await (await app.request(`/books/${label}/stages/status`)).json()
  expect(result.summary).toMatchObject({ status: "complete", extraction: "verified-reusable" })
  expect(result.summary.outputs.every((output: { state: string }) => ["reused", "skipped"].includes(output.state))).toBe(true)
  const s = storage()
  try { expect(s.getAllNodeVersions("text-catalog-translation", "fr-FR")).toHaveLength(1) } finally { s.close() }
})

it("revalidates a queued manifest after the previous writer finishes", async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const response = transport.getMockImplementation()!
  transport.mockImplementation(async (...args) => { await held; return response(...args) })
  await post(); await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
  await post()
  // Simulate external filesystem damage, not an authorized writer mutation.
  fs.writeFileSync(path.join(root, "books", label, "extraction.json"), "{}")
  release()
  await vi.waitFor(() => expect(service.getStatus(label).active?.status).toBe("failed"), { timeout: 10_000 })
  expect(service.getStatus(label).active?.error).toContain("EXTRACTION_INCOMPLETE")
  expect(service.getStatus(label).summary).toBeUndefined()
  expect(transport).toHaveBeenCalledTimes(1)
})

it("reports protected unresolved output instead of a completed job and preserves its history", async () => {
  const s = storage()
  s.putNodeData("text-catalog-translation", "fr-FR", { entries: [{ id: "a", text: "Legacy correction" }], generatedAt: "old" }); s.close()
  await post()
  await vi.waitFor(() => expect(service.getStatus(label).active?.status).toBe("failed"))
  const result = await (await app.request(`/books/${label}/step-status`)).json()
  expect(result.resumeSummary).toMatchObject({ status: "incomplete" })
  expect(result.error).toContain("RESUME_INCOMPLETE")
  expect(transport).not.toHaveBeenCalled()
  const verify = storage()
  try { expect(verify.getAllNodeVersions("text-catalog-translation", "fr-FR")).toHaveLength(1) } finally { verify.close() }
})
