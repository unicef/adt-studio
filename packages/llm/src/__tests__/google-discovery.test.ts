import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDefaultProviderRegistry } from "../providers/index.js"
import { checkProviderConnection } from "../provider-health.js"

const fetchMock = vi.fn<typeof fetch>()

const listing = {
  models: [
    { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.1-flash-tts-preview", displayName: "Gemini 3.1 Flash TTS", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.1-flash-image", supportedGenerationMethods: ["generateContent"] },
  ],
}

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => Response.json(listing))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const registry = createDefaultProviderRegistry()
const credentials = { google: { apiKey: "AIza-test" } }

describe("Google model discovery, shared with Gemini Speech", () => {
  it("tags TTS models as speech so the Google provider never offers them as text models", async () => {
    const models = await registry.listModels("google", { credentials })
    const byId = new Map(models.map((m) => [m.id, m.modalities]))
    expect(byId.get("gemini-2.5-pro")).toEqual(["structured-text", "agent"])
    expect(byId.get("gemini-2.5-flash-preview-tts")).toEqual(["tts"])
    expect(byId.get("gemini-3.1-flash-image")).toEqual(["image"])

    const text = await registry.listModels("google", { credentials, modality: "structured-text" })
    expect(text.map((m) => m.id)).toEqual(["gemini-2.5-pro"])
  })

  it("lists only the TTS models for Gemini Speech, through the shared Google key", async () => {
    // No Gemini key of its own: the shared Google key is resolved by the registry.
    const models = await registry.listModels("gemini", { credentials })
    expect(models.map((m) => m.id)).toEqual([
      "gemini-2.5-flash-preview-tts",
      "gemini-3.1-flash-tts-preview",
    ])
    expect(models[1]?.displayName).toBe("Gemini 3.1 Flash TTS")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]!
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("AIza-test")
  })

  it("turns the listing into a live connection check for Gemini Speech", async () => {
    const health = await checkProviderConnection(registry, "gemini", { credentials })
    expect(health).toEqual({ providerId: "gemini", ok: true, code: "ok", modelCount: 2 })
  })

  it("reports a rejected key for Gemini Speech instead of pretending it is connected", async () => {
    fetchMock.mockImplementation(async () => new Response("denied", { status: 403 }))
    const health = await checkProviderConnection(registry, "gemini", {
      credentials: { gemini: { apiKey: "AIza-bad" } },
    })
    expect(health.ok).toBe(false)
    expect(health.code).toBe("invalid-credential")
  })
})
