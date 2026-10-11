import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, writeSectioningLifecycle, withBookWriter } from "@adt/storage"
import { stampGeneratedRendering, loadBookConfig, readGenerationCatalog } from "@adt/pipeline"
import { saveStoryboard, storedSynchronization } from "./storyboard-save.js"
import { PageSectioningOutput } from "@adt/types"
import { reRenderPage } from "./page-edit-service.js"

const fetchMock = vi.fn()
const label = "fresh-book"
const pageId = "pg001"
const sectionId = "pg001_sec002"
const neighbor = { sectionIndex: 0, sectionType: "text", reasoning: "manual",
  html: '<section data-section-id="pg001_sec001"><p>Keep custom neighbor</p></section>' }
let booksDir: string

function options(prompt?: string) {
  return { label, pageId, repair: { baseVersion: 2, renderingVersion: 2, sectionIds: [sectionId] }, prompt, booksDir,
    promptsDir: path.resolve("prompts"), configPath: path.resolve("config.yaml"),
    credentials: { openai: { apiKey: "test" } },
  }
}
function readState() {
  const storage = createBookStorage(label, booksDir)
  try {
    return {
      source: storage.getLatestNodeData("page-sectioning", pageId),
      rendering: storage.getLatestNodeData("web-rendering", pageId),
      translation: storage.getLatestNodeData("text-catalog-translation", "es"),
      steps: storage.getStepRuns(),
    }
  } finally { storage.close() }
}
beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "rerender-fresh-"))
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({ pageId, pageNumber: 1, text: "Source", images: [],
      pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("retained-image"), format: "png", hash: "test", width: 100, height: 100 },
    })
    storage.putNodeData("page-sectioning", pageId, { reasoning: "Source", sections: [1, 2].map((n) => ({
      sectionId: `pg001_sec00${n}`, sectionType: "text", backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false,
      nodes: [{ nodeId: `text-${n}`, role: "text", text: "Source", isPruned: false }],
    })) })
    storage.putNodeData("web-rendering", pageId, { sections: [neighbor,
      { ...neighbor, sectionIndex: 1, html: `<section data-section-id="${sectionId}"><p data-id="text-2">Source</p></section>` },
    ] })
    storage.putNodeData("text-catalog-translation", "es", { manual: "preserve on failure" })
    storage.markStepCompleted("catalog-translation")
  } finally { storage.close() }
  writeSectioningLifecycle(path.join(booksDir, label), "dynamic", true)
  fs.writeFileSync(path.join(booksDir, label, "config.yaml"), "default_model: openai:gpt-4o-mini\ndefault_render_strategy: llm\nrender_strategies:\n  llm:\n    render_type: llm\n    config:\n      prompt: web_generation_html\n      max_retries: 0\n      visual_refinement:\n        enabled: false\n")
  const seeded = createBookStorage(label, booksDir)
  try {
    const source = PageSectioningOutput.parse(seeded.getLatestNodeData("page-sectioning", pageId)!.data)
    const generated = stampGeneratedRendering({ sections: [{ sectionIndex: 99, sectionType: "text", reasoning: "generated",
      html: `<section data-section-id="${sectionId}" data-section-type="text"><p data-id="text-2">Source</p></section>` }] }, source, pageId, 1)
    seeded.putNodeData("web-rendering", pageId, { sections: [neighbor, ...generated.sections] })
    const changed = structuredClone(source)
    changed.sections[1].nodes.push({ nodeId: "text-added", role: "text", text: "Added", isPruned: false })
    withBookWriter(seeded.bookDir!, () => saveStoryboard(seeded, pageId,
      { sectioning: changed, baseVersion: 1, renderingVersion: 2 }, loadBookConfig(label, booksDir, path.resolve("config.yaml"))))
  } finally { seeded.close() }

})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(booksDir, { recursive: true, force: true })
})


function repairedResponse() {
  const content = `<section data-section-type="text" data-section-id="${sectionId}"><p data-id="text-2">Source</p><p data-id="text-added">Added</p></section>`
  return new Response(JSON.stringify({ id: "chatcmpl-test", object: "chat.completion", created: 0, model: "gpt-4o-mini",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ reasoning: "Fresh", content }) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }), { headers: { "Content-Type": "application/json" } })
}
function sync() {
  const storage = createBookStorage(label, booksDir)
  try { return storedSynchronization(storage, pageId, "reflowable") } finally { storage.close() }
}
function cache() {
  const dir = path.join(booksDir, label, ".cache")
  return fs.existsSync(dir) ? Object.fromEntries(fs.readdirSync(dir).map((name) => [name, fs.readFileSync(path.join(dir, name), "utf8")])) : {}
}
describe("stable targeted repair at the real provider transport", () => {
  it("publishes a verified stable section, retaining unknown neighbors and downstream histories", async () => {
    expect(sync().sections.find((s) => s.sectionId === sectionId)).toMatchObject({ status: "structural-drift", action: "repair" })
    const before = readState()
    fetchMock.mockResolvedValueOnce(repairedResponse())
    const result = await reRenderPage(options())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.version).toBe(3)
    const after = readState()
    expect((after.rendering!.data as { sections: unknown[] }).sections[0]).toEqual(neighbor)
    expect(after.source).toEqual(before.source)
    expect(after.translation).toEqual(before.translation)
    expect(sync().sections.find((s) => s.sectionId === sectionId)).toMatchObject({ status: "current", action: "none" })
    expect(Object.values(cache()).join(" ")).toContain("text-added")
  })
  it("keeps drift while work is pending and rejects a cancelled result without changing content or cache", async () => {
    const before = readState(), oldCache = cache()
    let resolve!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r }))
    const controller = new AbortController()
    const work = reRenderPage({ ...options(), signal: controller.signal })
    const rejected = expect(work).rejects.toThrow()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(sync().sections.find((s) => s.sectionId === sectionId)?.status).toBe("structural-drift")
    controller.abort(new Error("Cancelled"))
    resolve(repairedResponse())
    await rejected
    expect(readState()).toEqual(before)
    expect(cache()).toEqual(oldCache)
  })
  it("rejects stale repair inputs and protected IDs before provider transport", async () => {
    const before = readState()
    await expect(reRenderPage({ ...options(), repair: { baseVersion: 1, renderingVersion: 2, sectionIds: [sectionId] } })).rejects.toThrow()
    await expect(reRenderPage({ ...options(), repair: { baseVersion: 2, renderingVersion: 2, sectionIds: ["pg001_sec001"] } })).rejects.toThrow(/eligible/)
    await expect(reRenderPage({ ...options(), repair: { baseVersion: 2, renderingVersion: 2, sectionIds: ["retired"] } })).rejects.toThrow(/eligible/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readState()).toEqual(before)
  })
  it("retains previous output after a provider failure", async () => {
    const before = readState()
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"denied"}}', { status: 401 }))
    await expect(reRenderPage(options())).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readState()).toEqual(before)
    expect(sync().sections.find((s) => s.sectionId === sectionId)?.action).toBe("repair")
  })
  it("rejects publication if inputs change during a provider call", async () => {
    const before = readState()
    fetchMock.mockImplementationOnce(async () => {
      const storage = createBookStorage(label, booksDir)
      try { storage.putNodeData("page-sectioning", pageId, { ...(before.source!.data as object), reasoning: "Concurrent writer bypassing admission" }) } finally { storage.close() }
      return repairedResponse()
    })
    await expect(reRenderPage(options())).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readState().rendering).toEqual(before.rendering)
    expect(readState().translation).toEqual(before.translation)
  })
  it("retains generated provenance after partial repair without certifying untouched inputs", async () => {
    const db = createBookStorage(label, booksDir)
    let oldSignature: string
    try {
      const source = PageSectioningOutput.parse(db.getAllNodeVersions("page-sectioning", pageId)[0].data)
      const row = db.getLatestNodeData("web-rendering", pageId)!
      const rendering = stampGeneratedRendering(row.data as never, source, pageId, 1)
      const status = readGenerationCatalog({ storage: db, config: loadBookConfig(label, booksDir, options().configPath), bookDir: db.bookDir!, promptsDir: options().promptsDir, configPath: options().configPath }).find((s) => s.identity.kind === "storyboard")!
      oldSignature = "previous-source-and-prompt-signature"
      db.putNodeData("web-rendering", pageId, { ...rendering, generationEvidence: { source: "ai", input: { signature: oldSignature, contentHash: status.contentHash, references: [] } } })
    } finally { db.close() }
    fetchMock.mockResolvedValueOnce(repairedResponse())
    await reRenderPage({ ...options(), repair: { ...options().repair, renderingVersion: 3 } })
    const current = createBookStorage(label, booksDir)
    try {
      const status = readGenerationCatalog({ storage: current, config: loadBookConfig(label, booksDir, options().configPath), bookDir: current.bookDir!, promptsDir: options().promptsDir, configPath: options().configPath }).find((s) => s.identity.kind === "storyboard")!
      expect(status).toMatchObject({ protected: false, current: false, updateNeeded: true })
      expect((current.getLatestNodeData("web-rendering", pageId)!.data as any).generationEvidence.input.signature).toBe(oldSignature)
    } finally { current.close() }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

})
