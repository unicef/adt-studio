import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GOOGLE_IMAGE_MODELS } from "@adt/types"
import { generateImageWithCache, type GenerateImageWithCacheOptions } from "../image.js"
import { googleProvider } from "../providers/google/index.js"
import { createProviderRegistry } from "../registry.js"

const png = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAYAAADkOT91AAAAH0lEQVR4AV3BwREAMAiAMMr+O1ufHsmbxSEhISEh8QGPSwQIxMxWxQAAAABJRU5ErkJggg=="
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]).toString("base64")
const image = { type: "image", mime_type: "image/png", data: png }
const success = { status: "completed", steps: [{ type: "model_output", content: [image] }] }
const registry = createProviderRegistry().register(googleProvider).freeze()
const credentials = { google: { apiKey: "google-secret" } }
const fetchMock = vi.fn<typeof fetch>()
let cacheDir: string

function generate(options: Partial<GenerateImageWithCacheOptions> = {}) {
  return generateImageWithCache({
    registry, providerCredentials: credentials, cacheDir,
    modelId: "google:gemini-3.1-flash-image", prompt: "Translate labels into français", ...options,
  })
}

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "google-image-"))
  vi.stubEnv("GOOGLE_API_KEY", "")
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "")
  vi.stubEnv("OPENAI_API_KEY", "")
  fetchMock.mockReset().mockImplementation(async () => Response.json(success))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  fs.rmSync(cacheDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("Google image backend", () => {
  it.each(Object.keys(GOOGLE_IMAGE_MODELS))("generates and edits with %s using only Google credentials", async (model) => {
    expect(await generate({ modelId: `google:${model}` })).toEqual({ base64: png, mimeType: "image/png", cached: false })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions")
    expect(init?.headers).toEqual({ "Content-Type": "application/json", "x-goog-api-key": "google-secret" })
    expect(JSON.parse(init!.body as string)).toEqual({
      model, input: [{ type: "text", text: "Translate labels into français" }], store: false,
    })
    await generate({ modelId: `google:${model}`, referenceImages: [{ data: Buffer.from(png, "base64") }] })
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).input[1]).toEqual(image)
  })

  it.each([["1024x1024", "1:1"], ["1536x1024", "3:2"], ["1024x1536", "2:3"]] as const)(
    "maps %s to %s and preserves reference order and MIME types", async (size, aspectRatio) => {
      await generate({ size, referenceImages: [
        { data: Buffer.from(png, "base64") },
        { data: Buffer.from("/9j/", "base64"), mimeType: "image/jpeg" },
      ] })
      const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
      expect(body.response_format).toEqual({ type: "image", aspect_ratio: aspectRatio })
      expect(body.input.slice(1)).toEqual([
        image, { type: "image", mime_type: "image/jpeg", data: "/9j/" },
      ])
    },
  )

  it("accepts the JPEG the Interactions API actually returns and reports its mime type", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "completed", steps: [
      { type: "model_output", content: [{ type: "image", mime_type: "image/jpeg", data: jpg }] },
    ] }))
    expect(await generate()).toEqual({ base64: jpg, mimeType: "image/jpeg", cached: false })
  })

  it("ignores thought images and text, selecting the final model image", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "completed", steps: [
      { type: "thought", content: [{ ...image, data: "not-a-final-image" }] },
      { type: "model_output", content: [{ type: "text", text: "Done" }, image] },
    ] }))
    expect((await generate()).base64).toBe(png)
  })

  it("caches identical edits and separates ordered references, prompt, model and size", async () => {
    const refs = [{ data: Buffer.from(png, "base64") }, { data: Buffer.from("other") }]
    expect((await generate({ referenceImages: refs })).cached).toBe(false)
    expect((await generate({ referenceImages: refs })).cached).toBe(true)
    for (const options of [
      { referenceImages: [...refs].reverse() },
      { referenceImages: refs, prompt: "Translate into español" },
      { referenceImages: refs, modelId: "google:gemini-3-pro-image" },
      { referenceImages: refs, size: "1024x1024" as const },
    ]) expect((await generate(options)).cached).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it.each([401, 403, 429, 500])("reports HTTP %s without exposing provider response secrets or caching failures", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "google-secret" } }, { status }))
    const onLog = vi.fn()
    await expect(generate({ onLog, log: { taskType: "image-generation", promptName: "test" } })).rejects.toThrow(`HTTP ${status}`)
    expect(JSON.stringify(onLog.mock.calls)).not.toContain("google-secret")
    expect(fs.readdirSync(cacheDir)).toEqual([])
  })

  it.each([
    {},
    { status: "failed", steps: [] },
    { status: "completed", steps: [] },
    { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "Blocked" }] }] },
    { status: "completed", steps: [{ type: "model_output", content: [{ ...image, mime_type: "image/jpeg" }] }] },
    { status: "completed", steps: [{ type: "model_output", content: [{ ...image, data: png.slice(0, 40) }] }] },
  ])("rejects malformed, incomplete or non-image responses", async (response) => {
    fetchMock.mockResolvedValueOnce(Response.json(response))
    await expect(generate()).rejects.toThrow(/Google/)
    expect(fs.readdirSync(cacheDir)).toEqual([])
  })

  it("requires the selected provider's credential before calling Google", async () => {
    await expect(generate({ providerCredentials: { openai: { apiKey: "wrong-provider" } } })).rejects.toMatchObject({ code: "missing-credential" })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.stubEnv("GOOGLE_API_KEY", "server-google-key")
    await generate({ providerCredentials: undefined })
    expect(fetchMock.mock.calls[0]![1]!.headers).toHaveProperty("x-goog-api-key", "server-google-key")
  })

  it("rejects unsupported reference counts, MIME types, sizes and oversized inline requests", async () => {
    await expect(generate({ modelId: "google:gemini-2.5-flash-image", referenceImages: Array(4).fill({ data: Buffer.from(png, "base64") }) })).rejects.toMatchObject({ code: "unsupported-capability" })
    await expect(generate({ referenceImages: [{ data: Buffer.from("bad"), mimeType: "text/plain" }] })).rejects.toMatchObject({ code: "unsupported-capability" })
    await expect(generate({ size: "42x42" })).rejects.toMatchObject({ code: "unsupported-capability" })
    await expect(generate({ prompt: "x".repeat(20 * 1024 * 1024) })).rejects.toThrow("20 MB")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("honours cancellation and timeout without caching", async () => {
    await expect(generate({ signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })
    }))
    await expect(generate({ timeoutMs: 5 })).rejects.toMatchObject({ name: "TimeoutError" })
    expect(fs.readdirSync(cacheDir)).toEqual([])
  })

  it("classifies image models separately and resolves model-specific capabilities", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ models: [
      ...Object.keys(GOOGLE_IMAGE_MODELS).map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ["generateContent"] })),
      { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
    ] }))
    expect((await registry.listModels("google", { credentials, modality: "image" })).map((m) => m.id)).toEqual(Object.keys(GOOGLE_IMAGE_MODELS))
    expect(registry.capabilities("image", "google:gemini-2.5-flash-image", { credentials }).maxReferenceImages).toBe(3)
    expect(() => registry.resolveImage("google:gemini-2.5-flash", { credentials })).toThrow("image model")
    expect(() => registry.resolveStructuredText("google:gemini-3.1-flash-image", { credentials })).toThrow("image-only model")
    expect(() => registry.resolveAgent("google:gemini-3.1-flash-image", { credentials })).toThrow("image-only model")
  })
})
