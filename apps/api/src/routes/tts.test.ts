import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
const { transcribeWithWhisperMock } = vi.hoisted(() => ({
  transcribeWithWhisperMock: vi.fn(),
}))
vi.mock("@adt/llm", async () => {
  const actual = await vi.importActual<typeof import("@adt/llm")>("@adt/llm")
  return {
    ...actual,
    transcribeWithWhisper: transcribeWithWhisperMock,
  }
})
import { createTTSRoutes } from "./tts.js"

let tmpDir = ""
let configPath = ""

function writeConfig(defaultProvider = "gemini"): void {
  fs.writeFileSync(
    configPath,
    `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: ${defaultProvider}
  providers:
    ${defaultProvider}:
      languages:
        - en
`
  )
}

/** The `params` recorded on the newest llm_log row, or undefined if none.
 *  Read straight from the DB the way the debug route does — storage exposes a
 *  writer for log rows but no reader. */
function readLatestLogParams(label: string): Record<string, unknown> | undefined {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  try {
    const rows = db.all(
      "SELECT data FROM llm_log ORDER BY id DESC LIMIT 1"
    ) as Array<{ data: string }>
    if (rows.length === 0) return undefined
    return (JSON.parse(rows[0].data) as { params?: Record<string, unknown> }).params
  } finally {
    db.close()
  }
}

function seedBook(
  label: string,
  entries: Array<{ id: string; text: string }> = [{ id: "pg001_t001", text: "Hello world" }]
): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putNodeData("metadata", "book", {
      title: "Test Book",
      authors: ["Author"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "test",
    })
    storage.putNodeData("text-catalog", "book", {
      entries,
      generatedAt: new Date().toISOString(),
    })
    storage.putNodeData("core-tts-catalog", "en", {
      language: "en",
      generatedAt: new Date().toISOString(),
      entries: entries.map((entry) => ({
        id: entry.id,
        displayText: entry.text,
        speechText: entry.text,
        changed: false,
        transformations: [],
        status: "ready",
        generation: {
          mode: "unchanged",
          generatedAt: new Date().toISOString(),
          enabledTransformations: [],
          sourceTextHash: "source",
          contextHash: "context",
        },
      })),
    })
  } finally {
    storage.close()
  }
}

describe("POST /books/:label/tts/generate-one", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-tts-route-"))
    configPath = path.join(tmpDir, "config.yaml")
    writeConfig()
    fetchMock.mockReset()
    transcribeWithWhisperMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ""
    configPath = ""
  })

  it("generates a missing Gemini audio file and stores a new TTS version", async () => {
    const label = "gemini-audio"
    seedBook(label)

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString(
                        "base64"
                      ),
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry.textId).toBe("pg001_t001")
    expect(body.entry.fileName).toBe("pg001_t001.wav")
    expect(body.completed).toBe(true)
    expect(body.remainingItems).toBe(0)

    const storage = createBookStorage(label, tmpDir)
    try {
      const ttsRow = storage.getLatestNodeData("tts", "en")
      expect(ttsRow?.version).toBe(1)
      expect((ttsRow?.data as { entries: Array<{ textId: string }> }).entries).toHaveLength(1)
      expect(storage.getStepRuns().find((step) => step.step === "tts")?.status).toBe(
        "done"
      )
    } finally {
      storage.close()
    }

    expect(
      fs.existsSync(path.join(tmpDir, label, "audio", "en", "pg001_t001.wav"))
    ).toBe(true)
  })

  it("treats excluded catalog entries as complete after generating the remaining audio", async () => {
    const label = "excluded-completion"
    seedBook(label, [
      { id: "pg001_t001", text: "Hello world" },
      { id: "pg001_t002", text: "Muted text" },
    ])
    fs.writeFileSync(
      path.join(tmpDir, label, "config.yaml"),
      "speech:\n  excluded_text_ids:\n    - pg001_t002\n",
    )

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed).toBe(true)
    expect(body.remainingItems).toBe(0)
  })

  it("preserves failure records for other entries when one item is regenerated", async () => {
    const label = "preserve-failures"
    seedBook(label, [
      { id: "pg001_t001", text: "Hello world" },
      { id: "pg001_t002", text: "Still missing" },
    ])
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("tts", "en", {
        entries: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
        failed: [
          { textId: "pg001_t001", error: "old failure" },
          { textId: "pg001_t002", error: "still failed" },
        ],
      })
    } finally {
      storage.close()
    }

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)

    const after = createBookStorage(label, tmpDir)
    try {
      const ttsRow = after.getLatestNodeData("tts", "en")
      expect((ttsRow?.data as { failed?: Array<{ textId: string; error: string }> }).failed).toEqual([
        { textId: "pg001_t002", error: "still failed" },
      ])
    } finally {
      after.close()
    }
  })

  it("generates Gemini audio when the response includes a text part before the audio part", async () => {
    const label = "gemini-audio-multipart"
    seedBook(label)

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "Audio generated successfully." },
                  {
                    inlineData: {
                      mimeType: "audio/L16;rate=24000",
                      data: Buffer.from(new Uint8Array([9, 10, 11, 12])).toString(
                        "base64"
                      ),
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry.fileName).toBe("pg001_t001.wav")
    expect(body.remainingItems).toBe(0)
  })

  it("retries single-item Gemini audio generation with the alternate preview model when the first model returns no audio", async () => {
    const label = "gemini-audio-fallback-model"
    seedBook(label)

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: "No audio returned for this request." },
                  ],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        data: Buffer.from(new Uint8Array([13, 14, 15, 16])).toString(
                          "base64"
                        ),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry.fileName).toBe("pg001_t001.wav")
    expect(body.entry.model).toBe("gemini-2.5-pro-preview-tts")
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [firstUrl] = fetchMock.mock.calls[0]
    const [secondUrl] = fetchMock.mock.calls[1]
    expect(String(firstUrl)).toContain("gemini-2.5-flash-preview-tts")
    expect(String(secondUrl)).toContain("gemini-2.5-pro-preview-tts")
  })

  it("falls back to OpenAI when both Gemini preview models return no audio", async () => {
    const label = "gemini-audio-openai-fallback"
    seedBook(label)
    fs.writeFileSync(
      path.join(tmpDir, label, "config.yaml"),
      "default_speech_generation_model: tts-1-hd\n",
    )

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "No audio returned for this request." }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "Still no audio returned for this request." }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([17, 18, 19, 20]), {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        })
      )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
        "X-OpenAI-Key": "sk-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry.fileName).toBe("pg001_t001.wav")
    expect(body.entry.provider).toBe("openai")
    expect(body.entry.model).toBe("tts-1-hd")
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const [firstUrl] = fetchMock.mock.calls[0]
    const [secondUrl] = fetchMock.mock.calls[1]
    const [thirdUrl, thirdInit] = fetchMock.mock.calls[2]
    expect(String(firstUrl)).toContain("gemini-2.5-flash-preview-tts")
    expect(String(secondUrl)).toContain("gemini-2.5-pro-preview-tts")
    expect(String(thirdUrl)).toBe("https://api.openai.com/v1/audio/speech")
    expect(thirdInit?.headers).toMatchObject({
      Authorization: "Bearer sk-test",
      "Content-Type": "application/json",
    })
    expect(JSON.parse(String(thirdInit?.body))).toMatchObject({ model: "tts-1-hd" })
  })

  it("falls back to ElevenLabs when Gemini has no audio and no OpenAI/Azure keys are configured", async () => {
    const label = "gemini-audio-elevenlabs-fallback"
    seedBook(label)

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "No audio returned for this request." }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "Still no audio returned for this request." }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([21, 22, 23, 24]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        })
      )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
        "X-ElevenLabs-API-Key": "el-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry.provider).toBe("elevenlabs")
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const [thirdUrl, thirdInit] = fetchMock.mock.calls[2]
    expect(String(thirdUrl)).toContain("https://api.elevenlabs.io/v1/text-to-speech/")
    expect(thirdInit?.headers).toMatchObject({ "xi-api-key": "el-test" })
  })

  // Single-item regeneration used to hard-fail for every provider but Gemini,
  // so a book routed to ElevenLabs could never regenerate one entry from the UI
  // — which is exactly the listen-and-retune loop the voice-tuning settings need.
  it("generates a single item for an ElevenLabs-routed language with only an ElevenLabs key", async () => {
    writeConfig("elevenlabs")
    const label = "elevenlabs-single-item"
    seedBook(label)

    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([31, 32, 33, 34]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ElevenLabs-API-Key": "el-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry.provider).toBe("elevenlabs")
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("https://api.elevenlabs.io/v1/text-to-speech/")
    expect(init?.headers).toMatchObject({ "xi-api-key": "el-test" })
    // The voice-tuning defaults must reach this path too, not just full runs.
    expect(JSON.parse(String(init?.body)).voice_settings).toMatchObject({
      stability: 0.7,
      style: 0,
    })
  })

  it("asks for the ElevenLabs key by name when the language is routed to ElevenLabs", async () => {
    writeConfig("elevenlabs")
    const label = "elevenlabs-missing-key"
    seedBook(label)

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(400)
    await expect(res.text()).resolves.toContain("Set X-ElevenLabs-API-Key header.")
  })

  it("asks for the OpenAI key when the language is routed to OpenAI", async () => {
    writeConfig("openai")
    const label = "openai-audio"
    seedBook(label)

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // A Gemini key is no help when the language is routed to OpenAI.
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(400)
    await expect(res.text()).resolves.toContain("Set X-OpenAI-Key header.")
  })

  // The debug panel's Log tab could previously only show provider/model/voice,
  // so there was no way to tell which voice_settings produced a given audio file.
  it("records the ElevenLabs request settings on the debug log entry", async () => {
    writeConfig("elevenlabs")
    const label = "elevenlabs-log-params"
    seedBook(label)

    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([41, 42]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ElevenLabs-API-Key": "el-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })
    expect(res.status).toBe(200)

    const params = readLatestLogParams(label)
    // Effective settings, not just overrides — the book configures none here.
    expect(params).toMatchObject({
      stability: 0.7,
      similarityBoost: 0.5,
      style: 0,
      useSpeakerBoost: true,
      outputFormat: "mp3_44100_128",
      contextBefore: false,
      contextAfter: false,
    })
  })

  // Regression: the synthesizer used to be built without audioOptions here, so a
  // regenerated entry was synthesized at ElevenLabs' default mp3_44100_128 while
  // the rest of the book used the configured rates — and the debug log reported
  // the configured format, describing a request that was never made.
  it("honors speech.sample_rate/bit_rate and logs the format it actually requested", async () => {
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: elevenlabs
  sample_rate: 22050
  bit_rate: "32"
  providers:
    elevenlabs:
      languages:
        - en
`
    )
    const label = "elevenlabs-audio-options"
    seedBook(label)

    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([51, 52]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ElevenLabs-API-Key": "el-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })
    expect(res.status).toBe(200)

    expect(String(fetchMock.mock.calls[0][0])).toContain("output_format=mp3_22050_32")
    expect(readLatestLogParams(label)).toMatchObject({ outputFormat: "mp3_22050_32" })
  })

  // Regression: this route used to construct the Azure synthesizer without
  // audio options, silently falling back to 24 kHz / 48 kbitrate while a full
  // Speech run correctly honored the book configuration.
  it("honors speech.sample_rate/bit_rate for a single Azure regeneration", async () => {
    fs.writeFileSync(
      configPath,
      `role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
speech:
  default_provider: azure
  sample_rate: 48000
  bit_rate: "192kbitrate"
  providers:
    azure:
      languages:
        - en
`
    )
    const label = "azure-audio-options"
    seedBook(label)

    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([53, 54]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Azure-Speech-Key": "az-test",
        "X-Azure-Speech-Region": "eastus",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })
    expect(res.status).toBe(200)

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers["X-Microsoft-OutputFormat"]).toBe("audio-48khz-192kbitrate-mono-mp3")
  })

  // Regression: ElevenLabs throttles on concurrent requests, so a 429 here used
  // to fail the entry outright — the only retry path was gated on Gemini's "did
  // not include audio data" message.
  it("retries an ElevenLabs 429 and succeeds", async () => {
    writeConfig("elevenlabs")
    const label = "elevenlabs-429-retry"
    seedBook(label)

    fetchMock
      .mockResolvedValueOnce(
        new Response("too many concurrent requests", {
          status: 429,
          statusText: "Too Many Requests",
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([61, 62]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        })
      )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ElevenLabs-API-Key": "el-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    expect((await res.json()).entry.provider).toBe("elevenlabs")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // A permanent 4xx must fail immediately rather than burning the retry budget
  // on a request that will never succeed.
  it("does not retry a permanent ElevenLabs 401", async () => {
    writeConfig("elevenlabs")
    const label = "elevenlabs-401-no-retry"
    seedBook(label)

    fetchMock.mockResolvedValue(
      new Response("invalid_api_key", { status: 401, statusText: "Unauthorized" })
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ElevenLabs-API-Key": "el-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not record ElevenLabs settings for a Gemini-routed language", async () => {
    writeConfig("gemini")
    const label = "gemini-log-params"
    seedBook(label)

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { data: Buffer.from([1, 2]).toString("base64") } }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })
    expect(res.status).toBe(200)

    expect(readLatestLogParams(label)).toBeUndefined()
  })

  it("still requires a Gemini key for a Gemini-routed language", async () => {
    writeConfig("gemini")
    const label = "gemini-missing-key"
    seedBook(label)

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(400)
    await expect(res.text()).resolves.toContain("Set X-Gemini-API-Key header.")
  })
})

describe("POST /books/:label/tts/upload-one", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-tts-route-"))
    configPath = path.join(tmpDir, "config.yaml")
    writeConfig()
    transcribeWithWhisperMock.mockReset()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ""
    configPath = ""
  })

  it("stores uploaded audio as a TTS entry and clears stale timestamps for that text", async () => {
    const label = "manual-audio"
    seedBook(label)

    const originalAudioDir = path.join(tmpDir, label, "audio", "en")
    fs.mkdirSync(originalAudioDir, { recursive: true })
    fs.writeFileSync(path.join(originalAudioDir, "pg001_t001.mp3"), Buffer.from([1, 2, 3]))

    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("tts", "en", {
        entries: [{
          textId: "pg001_t001",
          language: "en",
          fileName: "pg001_t001.mp3",
          voice: "alloy",
          model: "gpt-4o-mini-tts",
          cached: false,
          provider: "openai",
        }],
        generatedAt: new Date().toISOString(),
      })
      storage.putNodeData("tts-timestamps", "en", {
        entries: {
          pg001_t001: {
            textId: "pg001_t001",
            language: "en",
            words: [{ word: "Hello", start: 0, end: 0.5 }],
            duration: 0.5,
          },
        },
        generatedAt: new Date().toISOString(),
      })
    } finally {
      storage.close()
    }

    const formData = new FormData()
    formData.append("textId", "pg001_t001")
    formData.append("language", "en")
    formData.append(
      "audio",
      new File([new Uint8Array([9, 8, 7, 6])], "custom.wav", {
        type: "audio/wav",
      })
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/upload-one`, {
      method: "POST",
      body: formData,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.entry).toMatchObject({
      textId: "pg001_t001",
      fileName: "pg001_t001.wav",
      voice: "uploaded",
      model: "uploaded",
      provider: "manual",
      cached: false,
    })

    const after = createBookStorage(label, tmpDir)
    try {
      const ttsRow = after.getLatestNodeData("tts", "en")
      expect(ttsRow?.version).toBe(2)
      expect(
        (ttsRow?.data as {
          entries: Array<{
            textId: string
            language: string
            fileName: string
            voice: string
            model: string
            cached: boolean
            provider?: string
          }>
        }).entries
      ).toEqual([
        {
          textId: "pg001_t001",
          language: "en",
          fileName: "pg001_t001.wav",
          voice: "uploaded",
          model: "uploaded",
          cached: false,
          provider: "manual",
        },
      ])

      const timestampsRow = after.getLatestNodeData("tts-timestamps", "en")
      expect(
        (timestampsRow?.data as { entries: Record<string, unknown> }).entries
      ).toEqual({})
    } finally {
      after.close()
    }

    expect(
      fs.existsSync(path.join(tmpDir, label, "audio", "en", "pg001_t001.wav"))
    ).toBe(true)
    expect(
      fs.existsSync(path.join(tmpDir, label, "audio", "en", "pg001_t001.mp3"))
    ).toBe(false)
  })

  it("supports AI timestamp transcription for uploaded manual audio", async () => {
    const label = "manual-audio-transcribe"
    seedBook(label)

    transcribeWithWhisperMock.mockResolvedValue({
      words: [{ word: "Hello", start: 0, end: 0.5 }],
      duration: 0.5,
    })

    const formData = new FormData()
    formData.append("textId", "pg001_t001")
    formData.append("language", "en")
    formData.append(
      "audio",
      new File([new Uint8Array([4, 3, 2, 1])], "reader.wav", {
        type: "audio/wav",
      })
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const uploadRes = await app.request(`/books/${label}/tts/upload-one`, {
      method: "POST",
      body: formData,
    })
    expect(uploadRes.status).toBe(201)

    const transcribeRes = await app.request(`/books/${label}/tts/transcribe-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenAI-Key": "sk-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(transcribeRes.status).toBe(200)
    const body = await transcribeRes.json()
    expect(body.entry).toEqual({
      textId: "pg001_t001",
      language: "en",
      words: [{ word: "Hello", start: 0, end: 0.5 }],
      duration: 0.5,
    })
    expect(transcribeWithWhisperMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "pg001_t001.wav",
      "sk-test",
      "en",
      "Hello world",
    )

    const after = createBookStorage(label, tmpDir)
    try {
      const timestampsRow = after.getLatestNodeData("tts-timestamps", "en")
      expect((timestampsRow?.data as {
        entries: Record<string, unknown>
      }).entries.pg001_t001).toEqual({
        textId: "pg001_t001",
        language: "en",
        words: [{ word: "Hello", start: 0, end: 0.5 }],
        duration: 0.5,
      })
    } finally {
      after.close()
    }
  })
})

describe("DELETE /books/:label/tts", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-tts-route-"))
    configPath = path.join(tmpDir, "config.yaml")
    writeConfig()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ""
    configPath = ""
  })

  it("clears both tts and tts-timestamps data", async () => {
    const label = "delete-tts"
    seedBook(label)

    // Seed TTS and tts-timestamps data
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("tts", "en", {
        entries: [{ textId: "pg001_t001", fileName: "pg001_t001.wav" }],
        generatedAt: new Date().toISOString(),
      })
      storage.putNodeData("tts-timestamps", "en", {
        entries: {
          pg001_t001: {
            textId: "pg001_t001",
            language: "en",
            words: [{ word: "Hello", start: 0, end: 0.5 }],
            duration: 0.5,
          },
        },
        generatedAt: new Date().toISOString(),
      })
    } finally {
      storage.close()
    }

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts`, { method: "DELETE" })

    expect(res.status).toBe(200)

    const after = createBookStorage(label, tmpDir)
    try {
      expect(after.getLatestNodeData("tts", "en")).toBeNull()
      expect(after.getLatestNodeData("tts-timestamps", "en")).toBeNull()
    } finally {
      after.close()
    }
  })
})
