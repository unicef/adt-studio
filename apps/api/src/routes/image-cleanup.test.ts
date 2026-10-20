import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
import { renderSvgToPng, getPngMetadata } from "@adt/pdf"
import type { ImageCleanupCandidate } from "@adt/types"
import { createImageCleanupRoutes } from "./image-cleanup.js"
import { errorHandler } from "../middleware/error-handler.js"

let root: string
let config: string
let pageBytes: Buffer
let generatedBytes: Buffer
let app: ReturnType<typeof createImageCleanupRoutes>
let provider: ReturnType<typeof vi.spyOn<typeof globalThis, "fetch">>
const label = "cleanup-test"
const pageId = "pg001"
const sourceImageId = "pg001_im001"
const classification = { images: [{ imageId: sourceImageId, isPruned: false }] }
const input = { sourceImageId, expectedVersion: 1, region: { x: 10, y: 10, width: 20, height: 30 }, prompt: "Isolate the figure and preserve its labels." }

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-cleanup-"))
  config = path.join(root, "config.yaml")
  fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\ndefault_image_generation_model: openai:gpt-image-2.5-flare\n")
  pageBytes = await renderSvgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="white"/><circle cx="20" cy="20" r="10" fill="red"/></svg>', { zoom: 1 })
  generatedBytes = await renderSvgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><circle cx="10" cy="10" r="8" fill="red"/></svg>', { zoom: 1 })
  const storage = createBookStorage(label, root)
  try {
    const image = { pageId, buffer: pageBytes, format: "png" as const, hash: "fixture", width: 80, height: 60 }
    storage.putExtractedPage({
      pageId, pageNumber: 1, text: "Figure labels",
      pageImage: { ...image, imageId: `${pageId}_page` },
      images: [{ ...image, imageId: sourceImageId }],
      positionedText: { pageWidth: 40, pageHeight: 30, renderWidth: 80, renderHeight: 60, drawItems: [] },
    })
    storage.putNodeData("image-filtering", pageId, classification)
    for (const node of ["web-rendering", "image-captioning", "text-catalog", "tts"]) {
      storage.putNodeData(node, pageId, { edited: "preserve me" })
    }
  } finally { storage.close() }
  provider = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
    data: [{ b64_json: generatedBytes.toString("base64") }],
  }), { status: 200, headers: { "Content-Type": "application/json" } }))
  app = createImageCleanupRoutes(root, config)
  app.onError(errorHandler)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})

function post(body: unknown = input, suffix = "", page = pageId, headers: Record<string, string> = {}) {
  return app.request(`/books/${label}/pages/${page}/image-cleanup${suffix}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-OpenAI-Key": "fake-cleanup-key", ...headers },
    body: JSON.stringify(body),
  })
}

async function candidate() {
  const response = await post()
  expect(response.status).toBe(200)
  return await response.json() as ImageCleanupCandidate
}

it("crops the page, caches identical model calls, logs provenance, and leaves active data unchanged", async () => {
  const first = await candidate()
  const second = await candidate()
  expect(first.cached).toBe(false)
  expect(second.cached).toBe(true)
  expect(first.imageId).not.toBe(second.imageId)
  expect(provider).toHaveBeenCalledTimes(1)
  const request = provider.mock.calls[0][1]!
  const form = request.body as FormData
  const reference = form.get("image") as File
  expect(getPngMetadata(Buffer.from(await reference.arrayBuffer()))).toMatchObject({ width: 20, height: 30 })
  expect(form.get("prompt")).toBe(input.prompt)
  expect(form.get("model")).toBe("gpt-image-2.5-flare")
  const storage = createBookStorage(label, root)
  try {
    expect(storage.getLatestNodeData("image-filtering", pageId)).toEqual({ version: 1, data: classification })
    expect(storage.getImageBase64(sourceImageId)).toBe(pageBytes.toString("base64"))
    expect(storage.getImageBase64(first.imageId)).toBe(generatedBytes.toString("base64"))
    expect(storage.getLatestNodeData("image-cleanup", first.imageId)?.data).toMatchObject({ ...input, modelId: "openai:gpt-image-2.5-flare" })
  } finally { storage.close() }
  const db = openBookDb(path.join(root, label, `${label}.db`))
  try {
    const logs = db.all("SELECT * FROM llm_log")
    expect(logs).toHaveLength(2)
    expect(JSON.stringify(logs)).toContain(input.prompt)
    expect(JSON.stringify(logs)).not.toContain("fake-cleanup-key")
  } finally { db.close() }
})

it("switches between OpenAI and Nano Banana without sharing cache entries or changing book defaults", async () => {
  const originalConfig = fs.readFileSync(config, "utf8")
  const openaiResult = await candidate()
  provider.mockResolvedValue(new Response(JSON.stringify({ status: "completed", steps: [
    { type: "model_output", content: [{ type: "image", mime_type: "image/png", data: generatedBytes.toString("base64") }] },
  ] })))
  const googleInput = { ...input, modelId: "google:gemini-3.1-flash-image" }
  const googleHeaders = { "X-Google-API-Key": "fake-google-cleanup-key" }
  const response = await post(googleInput, "", pageId, googleHeaders)
  expect(response.status).toBe(200)
  const googleResult = await response.json() as ImageCleanupCandidate
  expect(googleResult).toMatchObject({ modelId: googleInput.modelId, cached: false })
  const [url, request] = provider.mock.calls[1]!
  expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions")
  expect(request!.headers).toEqual({ "Content-Type": "application/json", "x-goog-api-key": "fake-google-cleanup-key" })
  const body = JSON.parse(request!.body as string)
  expect(body.model).toBe("gemini-3.1-flash-image")
  expect(getPngMetadata(Buffer.from(body.input[1].data, "base64"))).toMatchObject({ width: 20, height: 30 })
  expect(await (await post(googleInput, "", pageId, googleHeaders)).json()).toMatchObject({ cached: true })
  expect(await candidate()).toMatchObject({ cached: true, modelId: openaiResult.modelId })
  expect(provider).toHaveBeenCalledTimes(2)
  expect(fs.readFileSync(config, "utf8")).toBe(originalConfig)
  const storage = createBookStorage(label, root)
  try {
    expect(storage.getLatestNodeData("image-cleanup", googleResult.imageId)?.data).toMatchObject({ modelId: googleInput.modelId })
  } finally { storage.close() }
})

it.each(["", "x".repeat(201), 42])("rejects invalid model selection %j before calling a provider", async (modelId) => {
  expect((await post({ ...input, modelId })).status).toBe(400)
  expect(provider).not.toHaveBeenCalled()
})

it("accepts once as a new extraction version without changing originals or downstream edits", async () => {
  const result = await candidate()
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await post({ imageId: result.imageId }, "/accept")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ version: 2 })
  }
  const storage = createBookStorage(label, root)
  try {
    expect(storage.getAllNodeVersions("image-filtering", pageId)).toEqual([
      { version: 1, data: classification },
      { version: 2, data: { images: [{ imageId: result.imageId, isPruned: false }] } },
    ])
    expect(storage.getAllNodeVersions("image-cleanup", result.imageId)).toHaveLength(2)
    for (const node of ["web-rendering", "image-captioning", "text-catalog", "tts"]) {
      expect(storage.getLatestNodeData(node, pageId)).toEqual({ version: 1, data: { edited: "preserve me" } })
    }
    expect(storage.setCurrentNodeVersion("image-filtering", pageId, 1)).toBe(true)
    expect(storage.getLatestNodeData("image-filtering", pageId)?.data).toEqual(classification)
    expect(storage.getImageBase64(sourceImageId)).toBe(pageBytes.toString("base64"))
  } finally { storage.close() }
})

it("updates every current Storyboard use across pages atomically, keeping history and unrelated edits", async () => {
  const storage = createBookStorage(label, root)
  const section = (id: string) => ({ sectionId: `${id}_sec001`, sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
    nodes: [{ nodeId: sourceImageId, role: "image", isPruned: false }, { nodeId: "caption", role: "caption", text: "Edited caption", isPruned: false }],
    placement: { [sourceImageId]: { bounds: { x: 1, y: 2, width: 10, height: 20 } } },
  })
  const render = (imageId: string) => ({ sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "My layout",
    html: `<section class="custom"><p>Edited text</p><img data-id="${imageId}" src="/api/books/${label}/images/${imageId}" width="42" alt="Edited alt" /></section>`,
  }] })
  for (const id of [pageId, "pg002"]) {
    storage.putNodeData("page-sectioning", id, { reasoning: "Original", sections: [section(id)] })
    storage.putNodeData("web-rendering", id, render(sourceImageId))
  }
  storage.putNodeData("web-rendering", "pg003", render(`${sourceImageId}_extra`))
  storage.markStepCompleted("web-rendering")
  storage.markStepCompleted("package-web")
  storage.close()
  const result = await candidate()
  // A saved text edit made during generation must survive acceptance.
  const edited = createBookStorage(label, root)
  edited.putNodeData("web-rendering", "pg002", { sections: [{ ...render(sourceImageId).sections[0], html: render(sourceImageId).sections[0].html.replace("Edited text", "Newest edit") }] })
  edited.close()
  expect((await post({ imageId: result.imageId }, "/accept")).status).toBe(200)
  const current = createBookStorage(label, root)
  try {
    for (const id of [pageId, "pg002"]) {
      const tree = current.getLatestNodeData("page-sectioning", id)!
      expect(tree.version).toBe(2)
      expect(JSON.stringify(tree.data)).toContain(result.imageId)
      expect(JSON.stringify(tree.data)).not.toContain(sourceImageId)
      const html = JSON.stringify(current.getLatestNodeData("web-rendering", id)!.data)
      expect(html).toContain(result.imageId)
      expect(html).toContain("Edited alt")
      expect(html).toContain(id === pageId ? "Edited text" : "Newest edit")
    }
    expect(current.getLatestNodeData("web-rendering", "pg003")?.version).toBe(1)
    expect(current.getAllNodeVersions("web-rendering", "pg002")).toHaveLength(3)
    expect(current.getLatestNodeData("image-captioning", pageId)?.data).toEqual({ edited: "preserve me" })
    expect(current.getStepRuns().find((run) => run.step === "web-rendering")?.status).toBe("done")
    expect(current.getStepRuns().find((run) => run.step === "package-web")).toBeUndefined()
  } finally { current.close() }
})

it("can clean a Storyboard-only image without inventing an extraction classification", async () => {
  const db = openBookDb(path.join(root, label, `${label}.db`))
  db.run("DELETE FROM node_data WHERE node = ? AND item_id = ?", ["image-filtering", pageId])
  db.close()
  const response = await post({ ...input, expectedVersion: null })
  expect(response.status).toBe(200)
  const result = await response.json() as ImageCleanupCandidate
  for (let i = 0; i < 2; i++) {
    const accepted = await post({ imageId: result.imageId }, "/accept")
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toEqual({ version: null })
  }
  const current = createBookStorage(label, root)
  expect(current.getLatestNodeData("image-filtering", pageId)).toBeNull()
  current.close()
})

it("rejects cleanup or acceptance while background tasks are running", async () => {
  const getActiveTasks = vi.fn().mockReturnValue([])
  app = createImageCleanupRoutes(root, config, { submitTask: vi.fn(), getActiveTasks })
  app.onError(errorHandler)
  const result = await candidate()
  getActiveTasks.mockReturnValue([{ status: "running" }])
  expect((await post()).status).toBe(409)
  expect((await post({ imageId: result.imageId }, "/accept")).status).toBe(409)
  expect(provider).toHaveBeenCalledTimes(1)
})

it("rolls back extraction and acceptance if saving a Storyboard replacement fails", async () => {
  const storage = createBookStorage(label, root)
  storage.putNodeData("web-rendering", pageId, { sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "Original",
    html: `<img data-id="${sourceImageId}" src="/api/books/${label}/images/${sourceImageId}">`,
  }] })
  storage.close()
  const result = await candidate()
  const db = openBookDb(path.join(root, label, `${label}.db`))
  db.run("CREATE TRIGGER fail_cleanup BEFORE INSERT ON node_data WHEN NEW.node = 'web-rendering' BEGIN SELECT RAISE(ABORT, 'test write failure'); END")
  db.close()
  expect((await post({ imageId: result.imageId }, "/accept")).status).toBe(500)
  const current = createBookStorage(label, root)
  try {
    expect(current.getLatestNodeData("image-filtering", pageId)).toEqual({ version: 1, data: classification })
    expect(current.getAllNodeVersions("image-cleanup", result.imageId)).toHaveLength(1)
    expect(JSON.stringify(current.getLatestNodeData("web-rendering", pageId)?.data)).toContain(sourceImageId)
  } finally { current.close() }
})

it.each([
  { ...input, sourceImageId: "../secret" },
  { ...input, sourceImageId: `${pageId}_page` },
  { ...input, region: { x: 70, y: 10, width: 20, height: 30 } },
  { ...input, region: { x: -1, y: 10, width: 20, height: 30 } },
  { ...input, region: { x: 0, y: 0, width: 0, height: 30 } },
])("rejects invalid source/crop before a model call: %j", async (body) => {
  expect((await post(body)).status).toBe(400)
  expect(provider).not.toHaveBeenCalled()
})

it("rejects acceptance after another edit and for another page", async () => {
  const result = await candidate()
  expect((await post({ imageId: result.imageId }, "/accept", "pg002")).status).toBe(404)
  const storage = createBookStorage(label, root)
  storage.putNodeData("image-filtering", pageId, classification)
  storage.close()
  expect((await post({ imageId: result.imageId }, "/accept")).status).toBe(409)
})

it("rejects acceptance while a pipeline step is running", async () => {
  const result = await candidate()
  const storage = createBookStorage(label, root)
  storage.markStepStarted("page-sectioning")
  storage.close()
  expect((await post({ imageId: result.imageId }, "/accept")).status).toBe(409)
})

it("uses the selected provider's credentials, failing before writes if absent", async () => {
  vi.stubEnv("GOOGLE_API_KEY", "")
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "")
  try {
    expect((await post({ ...input, modelId: "google:gemini-3.1-flash-image" })).status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
    const storage = createBookStorage(label, root)
    expect(storage.getPageImages(pageId)).toHaveLength(2)
    storage.close()
  } finally { vi.unstubAllEnvs() }
})

it("rejects page paths outside the book before reading or calling a model", async () => {
  const db = openBookDb(path.join(root, label, `${label}.db`))
  db.run("UPDATE images SET path = ? WHERE image_id = ?", ["../config.yaml", `${pageId}_page`])
  db.close()
  expect((await post()).status).toBe(400)
  expect(provider).not.toHaveBeenCalled()
})

it("rejects symlinked output directories that escape the book", async () => {
  const imageDir = path.join(root, label, "images")
  const outside = path.join(root, "outside")
  fs.renameSync(imageDir, outside)
  fs.symlinkSync(outside, imageDir, "dir")
  expect((await post()).status).toBe(400)
  expect(provider).not.toHaveBeenCalled()
})

it("keeps active images when the image model returns corrupt output", async () => {
  provider.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: "broken" }] })))
  expect((await post()).status).toBe(500)
  const storage = createBookStorage(label, root)
  try {
    expect(storage.getLatestNodeData("image-filtering", pageId)?.data).toEqual(classification)
    expect(storage.getPageImages(pageId)).toHaveLength(2)
  } finally { storage.close() }
})

it.each(["", "/accept"])("rejects malformed JSON at %s before a model call", async (suffix) => {
  const response = await app.request(`/books/${label}/pages/${pageId}/image-cleanup${suffix}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  })
  expect(response.status).toBe(400)
  expect(provider).not.toHaveBeenCalled()
})
