import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, writeSectioningLifecycle } from "@adt/storage"
import type { PipelineResumeSummary, TextCatalogOutput } from "@adt/types"
import { extractPDF } from "../pdf-extraction.js"
import { runFullPipeline } from "../pipeline-dag.js"
import { createStageRunner } from "../stage-execution.js"
import { loadBookConfig } from "../config.js"
import { readOutputCatalog } from "../output-catalog.js"

const repository = path.resolve(import.meta.dirname, "../../../..")
const pdfPath = path.join(repository, "tests/fixtures/raven.pdf")
let root: string
const label = "resume"
const transport = vi.fn<typeof fetch>()
const storage = () => createBookStorage(label, path.join(root, "books"))
const bookDir = () => path.join(root, "books", label)
const options = () => ({ label, pdfPath, booksRoot: path.join(root, "books"), promptsDir: path.join(root, "prompts"), templatesDir: path.join(repository, "templates"), configPath: path.join(root, "config.yaml"), fromStage: "translate" as const, toStage: "translate" as const })
const stageOptions = () => ({ ...options(), booksDir: options().booksRoot, credentials: {}, resume: true })
function rendering(a = "Hello", b = "World") {
  return { sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html: `<p data-id="a">${a}</p><p data-id="b">${b}</p>` }] }
}
function catalog() {
  const s = storage()
  try { return readOutputCatalog({ storage: s, config: loadBookConfig(label, options().booksRoot, options().configPath), bookDir: bookDir(), promptsDir: options().promptsDir, configDir: path.join(root, "config") }) }
  finally { s.close() }
}
function histories() {
  const s = storage()
  try { return s.getNodeVersionFingerprint() } finally { s.close() }
}
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-resume-"))
  fs.mkdirSync(path.join(root, "prompts")); fs.mkdirSync(path.join(root, "config"))
  const config = "role_types: {}\nstructure_types: {}\ndefault_model: ollama:tinyllama\nstart_page: 1\nend_page: 1\noutput_languages: [fr-FR]\ncore_tts:\n  max_retries: 0\n"
  fs.writeFileSync(path.join(root, "config.yaml"), config)
  fs.writeFileSync(path.join(root, "prompts/translation.liquid"), '{% chat role: "user" %}{% for t in texts %}TEXT|{{ t.text }}\n{% endfor %}{% endchat %}')
  fs.writeFileSync(path.join(root, "prompts/core_tts_preparation.liquid"), '{% chat role: "user" %}{% for e in entries %}ENTRY|{{ e.id }}|{{ e.display_text }}\n{% endfor %}{% endchat %}')
  const s = storage()
  await extractPDF({ pdfPath, startPage: 1, endPage: 1 }, s, { emit() {} })
  fs.writeFileSync(path.join(bookDir(), "config.yaml"), config)
  s.putNodeData("metadata", "book", { language_code: "en" })
  s.putNodeData("web-rendering", "pg001", rendering())
  s.putSignLanguageVideo("kept", Buffer.from("manual-video"), "kept.mp4", "video/mp4")
  s.close()
  writeSectioningLifecycle(bookDir(), "dynamic", true)
  transport.mockReset().mockImplementation(async (_url, request) => {
    const body = JSON.parse(String(request?.body))
    const prompt = body.messages.map((message: { content: string }) => message.content).join("\n") as string
    const object = { translations: [...prompt.matchAll(/TEXT\|([^\n]+)/g)].map(([, text]) => `French ${text}`) }
    return Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  })
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

it("resumes through the common executor, then proves current reuse with zero transport and version churn", async () => {
  const manifest = fs.readFileSync(path.join(bookDir(), "extraction.json"))
  const first = await runFullPipeline(options())
  expect([...first.stages.errors.values()].map((error) => error.message)).toEqual([])
  expect(first.resume?.status).toBe("complete")
  expect(first.resume?.outputs.some((output) => output.state === "completed")).toBe(true)
  expect(transport).toHaveBeenCalledTimes(1)
  const before = histories()
  transport.mockClear()
  const second = await runFullPipeline(options())
  expect(second.resume?.status).toBe("complete")
  expect(second.resume?.outputs.every((output) => output.state === "reused" || output.state === "skipped")).toBe(true)
  expect(transport).not.toHaveBeenCalled()
  expect(histories()).toEqual(before)
  expect(fs.readFileSync(path.join(bookDir(), "extraction.json"))).toEqual(manifest)
})

it("regenerates a changed consumer while preserving a manual neighbor and reports unresolved protected work", async () => {
  await runFullPipeline(options())
  const s = storage()
  const row = s.getLatestNodeData("text-catalog-translation", "fr-FR")!.data as TextCatalogOutput
  s.putNodeData("text-catalog-translation", "fr-FR", { ...row, entries: [row.entries[0], { id: "b", text: "My correction", source: "manual" }] })
  s.putNodeData("web-rendering", "pg001", rendering("Hi")); s.close()
  transport.mockClear()
  const result = await runFullPipeline(options())
  expect(result.resume?.status).toBe("incomplete")
  expect(result.stages.errors.size).toBe(1)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(transport.mock.calls[0][1]?.body)).toContain("Hi")
  expect(JSON.stringify(transport.mock.calls[0][1]?.body)).not.toContain("World")
  expect(result.resume?.outputs).toContainEqual(expect.objectContaining({ identity: { kind: "translation", id: "b", language: "fr-FR" }, state: "blocked", reason: "protected" }))
  const verify = storage()
  try {
    expect((verify.getLatestNodeData("text-catalog-translation", "fr-FR")!.data as TextCatalogOutput).entries[1]).toEqual({ id: "b", text: "My correction", source: "manual" })
    expect(verify.getAllNodeVersions("text-catalog-translation", "fr-FR")).toHaveLength(3)
  } finally { verify.close() }
  const calls = transport.mock.calls.length
  const before = histories()
  await runFullPipeline(options())
  expect(transport).toHaveBeenCalledTimes(calls)
  expect(histories()).toEqual(before)
})

it("rejects invalid ranges and mismatched extraction before content or transport", async () => {
  const before = histories()
  await expect(runFullPipeline({ ...options(), fromStage: "speech", toStage: "sectioning" })).rejects.toThrow("Invalid stage range")
  fs.appendFileSync(path.join(bookDir(), "config.yaml"), "spread_mode: true\n")
  await expect(createStageRunner().run(label, stageOptions(), { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_INPUTS_CHANGED" })
  await expect(runFullPipeline({ ...options(), fromStage: "sectioning", toStage: "speech" })).rejects.toMatchObject({ code: "EXTRACTION_INPUTS_CHANGED" })
  expect(transport).not.toHaveBeenCalled()
  expect(histories()).toEqual(before)
})

it("uses an exact replacement decision and rejects it when reviewed content changed", async () => {
  const s = storage()
  s.putNodeData("text-catalog-translation", "fr-FR", { entries: [{ id: "a", text: "Legacy" }, { id: "b", text: "Manual", source: "manual" }], generatedAt: "old" }); s.close()
  const a = catalog().find((output) => output.identity.kind === "translation" && output.identity.id === "a")!
  const outputScope = { selection: { identities: [a.identity] }, replace: [{ identity: a.identity, signature: a.signature, contentHash: a.contentHash, revision: a.revision }] }
  const result = await runFullPipeline({ ...options(), outputScope })
  expect(result.resume?.status).toBe("complete")
  expect(transport).toHaveBeenCalledTimes(1)
  const before = histories()
  const stale = await runFullPipeline({ ...options(), outputScope })
  expect([...stale.stages.errors.values()][0]?.message).toContain("changed since review")
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(1)
})

it("cancels at the transport boundary, retaining history; restart reassesses instead of marking attempted work current", async () => {
  const before = histories()
  const controller = new AbortController()
  const response = transport.getMockImplementation()!
  transport.mockImplementation(async (...args) => { const result = await response(...args); controller.abort(); return result })
  let summary: PipelineResumeSummary | undefined
  await expect(createStageRunner().run(label, { ...stageOptions(), signal: controller.signal, onResumeSummary: (value) => { summary = value } }, { emit() {} })).rejects.toThrow()
  expect(summary?.status).toBe("cancelled")
  const s = storage()
  try { expect(s.getLatestNodeData("text-catalog-translation", "fr-FR")).toBeNull(); expect(s.getAllNodeVersions("web-rendering", "pg001")).toHaveLength(1); expect(s.getStepRuns().some((step) => step.status === "running")).toBe(false) } finally { s.close() }
  transport.mockImplementation(response)
  const resumed = await runFullPipeline(options())
  expect(resumed.resume?.status).toBe("complete")
  expect(histories()).not.toEqual(before)
})

it("the actual CLI reports all-current reuse, and exits nonzero for retained unknown output", { timeout: 60_000 }, async () => {
  await runFullPipeline(options())
  const calls = path.join(root, "calls"), hook = path.join(root, "transport.mjs")
  fs.writeFileSync(hook, `import fs from 'node:fs'; globalThis.fetch = async () => { fs.appendFileSync(${JSON.stringify(calls)}, 'call'); throw new Error('unexpected provider call'); };`)
  const run = () => spawnSync(process.execPath, ["--import", pathToFileURL(hook).href, path.join(repository, "packages/pipeline/dist/cli.js"), label, pdfPath, "--books-dir", options().booksRoot, "--from-stage", "translate", "--to-stage", "translate"], { cwd: root, encoding: "utf8", timeout: 45_000 })
  const before = histories()
  const current = run()
  expect(current.status, current.stderr + current.stdout).toBe(0)
  expect(current.stdout + current.stderr).toContain('"state":"reused"')
  expect(histories()).toEqual(before)
  const s = storage()
  s.putNodeData("text-catalog-translation", "fr-FR", { entries: [{ id: "a", text: "Unknown" }, { id: "b", text: "Unknown too" }], generatedAt: "old" }); s.close()
  const unresolved = run()
  expect(unresolved.status, unresolved.stderr + unresolved.stdout).toBe(1)
  expect(unresolved.stdout + unresolved.stderr).toContain('"reason":"protected"')
  expect(fs.existsSync(calls)).toBe(false)
})

it("does not call an empty unknown selection current", async () => {
  const before = histories()
  const result = await runFullPipeline({ ...options(), outputScope: { selection: { identities: [{ kind: "translation", id: "unknown", language: "fr-FR" }] } } })
  expect([...result.stages.errors.values()][0]?.message).toContain("unavailable in this resume scope")
  expect(result.resume).toBeUndefined()
  expect(transport).not.toHaveBeenCalled()
  expect(histories()).toEqual(before)
})

it("mode preference alone preserves current catalog output without providers", async () => {
  await runFullPipeline(options())
  transport.mockClear()
  fs.appendFileSync(path.join(bookDir(), "config.yaml"), "page_sectioning:\n  mode: page\n")
  writeSectioningLifecycle(bookDir(), "page", true, false)
  const before = histories()
  const result = await runFullPipeline(options())
  expect([...result.stages.errors.values()]).toEqual([])
  expect(result.resume?.status).toBe("complete")
  expect(transport).not.toHaveBeenCalled()
  expect(histories()).toEqual(before)
})

it("retains and validates normal transport caches when source text returns to an earlier value", async () => {
  const selected = { ...options(), outputScope: { selection: { identities: [{ kind: "translation" as const, id: "a", language: "fr-FR" }] } } }
  await runFullPipeline(selected)
  expect(transport).toHaveBeenCalledTimes(1)
  const changed = storage(); changed.putNodeData("web-rendering", "pg001", rendering("Changed")); changed.close()
  await runFullPipeline(selected)
  expect(transport).toHaveBeenCalledTimes(2)
  const restored = storage(); restored.putNodeData("web-rendering", "pg001", rendering()); restored.close()
  const result = await runFullPipeline(selected)
  expect(result.resume?.status).toBe("complete")
  expect(transport).toHaveBeenCalledTimes(2)
  const verify = storage()
  try { expect(verify.getAllNodeVersions("text-catalog-translation", "fr-FR")).toHaveLength(3) } finally { verify.close() }
})
