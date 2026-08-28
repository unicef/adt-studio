import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createSpeechConfigRoutes } from "./speech-config.js"

let tmpDir: string
let configPath: string

const fetchMock = vi.fn<typeof fetch>()

function voicePage(
  voices: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ voices, ...extra }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("GET /speech-config/elevenlabs-voices", () => {
  // The voices cache is keyed by API key and lives for the life of the
  // process, so each test uses a distinct key to stay isolated.
  let apiKey: string
  let keyCounter = 0

  beforeEach(() => {
    apiKey = `el-test-${++keyCounter}`
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-speech-config-"))
    configPath = path.join(tmpDir, "config.yaml")
    fs.writeFileSync(configPath, "role_types: {}\n")
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    delete process.env.ELEVENLABS_API_KEY
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns the voices with names for the caller's key", async () => {
    fetchMock.mockResolvedValueOnce(
      voicePage([
        {
          voice_id: "21m00Tcm4TlvDq8ikWAM",
          name: "Rachel",
          category: "premade",
          labels: { accent: "american" },
        },
      ])
    )

    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/elevenlabs-voices", {
      headers: { "X-ElevenLabs-API-Key": apiKey },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      voices: [
        {
          voice_id: "21m00Tcm4TlvDq8ikWAM",
          name: "Rachel",
          category: "premade",
          labels: { accent: "american" },
        },
      ],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("https://api.elevenlabs.io/v2/voices")
    expect(String(url)).toContain("page_size=100")
    expect(init?.headers).toMatchObject({ "xi-api-key": apiKey })
  })

  it("round-trips editable Core TTS language profiles", async () => {
    const app = createSpeechConfigRoutes(configPath)
    const update = await app.request("/speech-config/core-tts-profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default: "General guidance", "pt-BR": "Brazilian guidance" }),
    })
    expect(update.status).toBe(200)

    const read = await app.request("/speech-config/core-tts-profiles")
    expect(await read.json()).toEqual({
      default: "General guidance",
      "pt-BR": "Brazilian guidance",
    })
  })

  it("follows pagination while has_more is set", async () => {
    fetchMock
      .mockResolvedValueOnce(
        voicePage([{ voice_id: "v1", name: "One" }], {
          has_more: true,
          next_page_token: "tok-2",
        })
      )
      .mockResolvedValueOnce(voicePage([{ voice_id: "v2", name: "Two" }], { has_more: false }))

    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/elevenlabs-voices", {
      headers: { "X-ElevenLabs-API-Key": apiKey },
    })

    const body = await res.json()
    expect(body.voices.map((v: { voice_id: string }) => v.voice_id)).toEqual(["v1", "v2"])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain("next_page_token=tok-2")
  })

  it("stops paginating when has_more is true but no token is returned", async () => {
    fetchMock.mockResolvedValueOnce(
      voicePage([{ voice_id: "v1" }], { has_more: true, next_page_token: null })
    )

    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/elevenlabs-voices", {
      headers: { "X-ElevenLabs-API-Key": apiKey },
    })

    expect((await res.json()).voices).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The voice picker is optional polish, so a missing key must not read as a
  // failure — the UI falls back to a free-text voice ID input.
  it("returns an empty list without calling ElevenLabs when no key is set", async () => {
    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/elevenlabs-voices")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ voices: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("falls back to ELEVENLABS_API_KEY when no header is sent", async () => {
    process.env.ELEVENLABS_API_KEY = "env-key"
    fetchMock.mockResolvedValueOnce(voicePage([{ voice_id: "v1" }]))

    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/elevenlabs-voices")

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "xi-api-key": "env-key" })
  })

  it("drops upstream fields we do not surface", async () => {
    fetchMock.mockResolvedValueOnce(
      voicePage([
        {
          voice_id: "v1",
          name: "One",
          preview_url: "https://example.invalid/sample.mp3",
          sharing: { status: "enabled" },
          settings: { stability: 0.3 },
        },
      ])
    )

    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/elevenlabs-voices", {
      headers: { "X-ElevenLabs-API-Key": apiKey },
    })

    expect((await res.json()).voices[0]).toEqual({ voice_id: "v1", name: "One" })
  })

  it("never echoes the API key in the response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("invalid_api_key", { status: 401, statusText: "Unauthorized" })
    )

    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/elevenlabs-voices", {
      headers: { "X-ElevenLabs-API-Key": "super-secret-key" },
    })

    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).not.toContain("super-secret-key")
    expect(JSON.parse(text).voices).toEqual([])
  })

  it("caches per key so repeated requests do not refetch", async () => {
    fetchMock.mockResolvedValue(voicePage([{ voice_id: "v1", name: "One" }]))

    const app = createSpeechConfigRoutes(configPath)
    const headers = { "X-ElevenLabs-API-Key": apiKey }
    await app.request("/speech-config/elevenlabs-voices", { headers })
    await app.request("/speech-config/elevenlabs-voices", { headers })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("GET/PUT /speech-config/voices", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-speech-config-voices-"))
    configPath = path.join(tmpDir, "config.yaml")
    fs.writeFileSync(configPath, "role_types: {}\n")
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns {} when voices.yaml does not exist", async () => {
    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/voices")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it("round-trips a legacy scalar voice mapping", async () => {
    const app = createSpeechConfigRoutes(configPath)
    const body = { openai: { en: "alloy", fr: "onyx" } }
    const update = await app.request("/speech-config/voices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(update.status).toBe(200)
    expect(await update.json()).toEqual(body)

    const read = await app.request("/speech-config/voices")
    expect(await read.json()).toEqual(body)
  })

  it("normalizes legacy slot mappings to the supported global primary voice", async () => {
    const app = createSpeechConfigRoutes(configPath)
    const body = {
      openai: {
        en: {
          primary: { voice: "alloy", label: "Narrator" },
          secondary: { voice: "shimmer", label: "Alt Narrator" },
        },
      },
    }
    const update = await app.request("/speech-config/voices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(update.status).toBe(200)
    const primaryOnly = {
      openai: {
        en: {
          primary: { voice: "alloy", label: "Narrator" },
        },
      },
    }
    expect(await update.json()).toEqual(primaryOnly)

    const read = await app.request("/speech-config/voices")
    expect(await read.json()).toEqual(primaryOnly)
  })

  it("rejects an invalid voice mapping body with 400", async () => {
    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/voices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // secondary must be an object with a `voice` string, not a bare number
      body: JSON.stringify({ openai: { en: { primary: { voice: "alloy" }, secondary: 42 } } }),
    })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBeDefined()

    // The invalid body must never be written to disk.
    expect(fs.existsSync(path.join(tmpDir, "config", "voices.yaml"))).toBe(false)
  })

  it("preserves valid mappings and warns for invalid entries on disk", async () => {
    const configDir = path.join(tmpDir, "config")
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, "voices.yaml"),
      "openai:\n  es: coral\n  en:\n    secondary: 42\n",
    )
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const app = createSpeechConfigRoutes(configPath)
    const res = await app.request("/speech-config/voices")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ openai: { es: "coral" } })
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
