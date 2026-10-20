import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { BACKGROUND_REMOVER_MODEL_ID, BACKGROUND_REMOVER_VERSION, BACKGROUND_REMOVER_INSTRUCTIONS } from "@adt/types"
import { generateImageWithCache, type GenerateImageWithCacheOptions } from "../image.js"
import { createProviderRegistry } from "../registry.js"
import { replicateProvider } from "../providers/replicate/index.js"
import { png, jpg } from "./image-fixtures.js"

const registry = createProviderRegistry().register(replicateProvider).freeze()
const fetchMock = vi.fn<typeof fetch>()
const apiUrl = "https://api.replicate.com/v1/predictions"
const outputUrl = "https://replicate.delivery/output/figure.png"
const success = { id: "trial1", status: "succeeded", output: outputUrl }
let cacheDir: string

function generate(options: Partial<GenerateImageWithCacheOptions> = {}) {
  return generateImageWithCache({
    registry, modelId: BACKGROUND_REMOVER_MODEL_ID, prompt: BACKGROUND_REMOVER_INSTRUCTIONS,
    providerCredentials: { replicate: { apiKey: "replicate-secret" } },
    referenceImages: [{ data: Buffer.from(png, "base64"), mimeType: "image/png" }],
    cacheDir, ...options,
  })
}

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "replicate-background-"))
  vi.stubEnv("REPLICATE_API_TOKEN", "")
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset().mockImplementation(async (url) => url === outputUrl
    ? new Response(Buffer.from(png, "base64"), { headers: { "Content-Type": "image/png" } })
    : Response.json(success))
})
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
  fs.rmSync(cacheDir, { recursive: true, force: true })
})

it("requests the pinned RGBA model, saves PNG bytes in cache, and logs images without secrets", async () => {
  const onLog = vi.fn()
  const options = { onLog, log: { taskType: "image-cleanup", promptName: "background-removal" } }
  expect(await generate(options)).toMatchObject({ base64: png, mimeType: "image/png", cached: false })
  expect(await generate(options)).toMatchObject({ base64: png, cached: true })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[0][0]).toBe(apiUrl)
  const request = fetchMock.mock.calls[0][1]!
  expect(request).toMatchObject({ method: "POST", redirect: "error", headers: { Authorization: "Bearer replicate-secret", Prefer: "wait=60", "Cancel-After": "180s" } })
  expect(JSON.parse(request.body as string)).toEqual({ version: BACKGROUND_REMOVER_VERSION,
    input: { image: `data:image/png;base64,${png}`, threshold: 0, reverse: false, background_type: "rgba", format: "png" },
  })
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer replicate-secret" } })
  expect(onLog.mock.calls[0][0]).toMatchObject({ modelId: BACKGROUND_REMOVER_MODEL_ID, success: true })
  expect(JSON.stringify(onLog.mock.calls)).not.toContain("replicate-secret")
  expect(JSON.stringify(onLog.mock.calls)).not.toContain(outputUrl)
})

it("polls an unfinished prediction at the fixed API origin before downloading", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ id: "trial1", status: "processing", urls: { get: "http://localhost/secret" } }))
  await generate()
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([apiUrl, `${apiUrl}/trial1`, outputUrl])
})

it("cancels a known prediction on timeout and does not cache a partial result", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ id: "trial1", status: "starting" }))
  await expect(generate({ timeoutMs: 20 })).rejects.toMatchObject({ name: "TimeoutError" })
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([apiUrl, `${apiUrl}/trial1/cancel`])
  expect(fs.readdirSync(cacheDir)).toEqual([])
})

it("honors cancellation before sending any image", async () => {
  await expect(generate({ signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" })
  expect(fetchMock).not.toHaveBeenCalled()
})

it.each([
  "http://replicate.delivery/out.png", "https://127.0.0.1/private", "https://replicate.delivery.evil.test/out.png",
  "https://replicate.delivery@evil.test/out.png", "https://user:secret@replicate.delivery/out.png", "https://replicate.delivery:444/out.png",
])("rejects unsafe output location %s before sending credentials", async (output) => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...success, output }))
  await expect(generate()).rejects.toThrow("unsupported output location")
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it.each([401, 403, 429, 500])("reports HTTP %s without reflecting provider secrets", async (status) => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "replicate-secret" }, { status }))
  const onLog = vi.fn()
  await expect(generate({ onLog, log: { taskType: "image-cleanup", promptName: "background-removal" } })).rejects.toThrow(`HTTP ${status}`)
  expect(JSON.stringify(onLog.mock.calls)).not.toContain("replicate-secret")
  expect(fs.readdirSync(cacheDir)).toEqual([])
})

it.each([
  { ...success, status: "failed", error: "replicate-secret" }, { ...success, status: "canceled" },
  { ...success, output: null }, { ...success, id: "../private" }, { ...success, status: "unknown" },
])("rejects failed or malformed predictions without caching: %j", async (payload) => {
  fetchMock.mockResolvedValueOnce(Response.json(payload))
  await expect(generate()).rejects.toThrow(/Replicate/)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fs.readdirSync(cacheDir)).toEqual([])
})

it.each([jpg, "corrupt"])("rejects non-PNG or corrupt downloaded output", async (base64) => {
  fetchMock.mockResolvedValueOnce(Response.json(success)).mockResolvedValueOnce(new Response(Buffer.from(base64, "base64")))
  await expect(generate()).rejects.toThrow()
  expect(fs.readdirSync(cacheDir)).toEqual([])
})

it("bounds downloaded output before decoding and never follows redirects", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(success)).mockResolvedValueOnce(new Response("too large", { headers: { "Content-Length": String(21 * 1024 * 1024) } }))
  await expect(generate()).rejects.toThrow("size limit")
  fetchMock.mockResolvedValueOnce(Response.json(success)).mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "http://localhost/private" } }))
  await expect(generate()).rejects.toThrow("HTTP 302")
  expect(fetchMock).toHaveBeenCalledTimes(4)
})

it("requires Replicate credentials and honors the server token without exposing it", async () => {
  await expect(generate({ providerCredentials: { openai: { apiKey: "wrong-key" } } })).rejects.toMatchObject({ code: "missing-credential" })
  expect(fetchMock).not.toHaveBeenCalled()
  vi.stubEnv("REPLICATE_API_TOKEN", "server-token")
  await generate({ providerCredentials: undefined })
  expect(fetchMock.mock.calls[0][1]!.headers).toMatchObject({ Authorization: "Bearer server-token" })
})

it("rejects generation, multiple inputs, resizing, and unsupported models before calls", async () => {
  await expect(generate({ referenceImages: [] })).rejects.toMatchObject({ code: "unsupported-capability" })
  await expect(generate({ referenceImages: [{ data: Buffer.from(png, "base64") }, { data: Buffer.from(png, "base64") }] })).rejects.toMatchObject({ code: "unsupported-capability" })
  await expect(generate({ size: "1024x1024" })).rejects.toMatchObject({ code: "unsupported-capability" })
  await expect(generate({ modelId: "replicate:other/model" })).rejects.toMatchObject({ code: "unsupported-capability" })
  expect(fetchMock).not.toHaveBeenCalled()
})

it("checks token health without creating predictions", async () => {
  const context = { providerId: "replicate", credentials: { apiKey: "secret" } }
  fetchMock.mockResolvedValueOnce(Response.json({ username: "test" }))
  expect(await replicateProvider.checkConnection!(context)).toMatchObject({ ok: true, code: "ok" })
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.replicate.com/v1/account")
  fetchMock.mockResolvedValueOnce(Response.json({ error: "secret" }, { status: 401 }))
  expect(await replicateProvider.checkConnection!(context)).toMatchObject({ ok: false, code: "missing-credential" })
})
