import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createElevenLabsTTSSynthesizer, createGeminiTTSSynthesizer, transcribeWithWhisper } from "../speech.js"

describe("createGeminiTTSSynthesizer", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("calls Gemini generateContent and wraps PCM output as wav", async () => {
    const pcmBytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from(pcmBytes).toString("base64"),
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

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })
    const result = await synth.synthesize({
      model: "gemini-2.5-pro-preview-tts",
      voice: "Kore",
      input: "Hello world",
      responseFormat: "wav",
    })

    expect(Buffer.from(result.subarray(0, 4)).toString("ascii")).toBe("RIFF")
    expect(result.byteLength).toBe(44 + pcmBytes.byteLength)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent"
    )
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-goog-api-key": "gm-test",
    })
    const sentBody = JSON.parse(String(init?.body))
    expect(sentBody).toMatchObject({
      contents: [{ parts: [{ text: "Hello world" }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Kore",
            },
          },
        },
      },
    })
    // Sampling is opt-in: with no temperature/seed provided, neither is sent
    // so Gemini uses its own defaults.
    expect(sentBody.generationConfig).not.toHaveProperty("temperature")
    expect(sentBody.generationConfig).not.toHaveProperty("seed")
  })

  it("lets caller override temperature and seed (per-book SpeechConfig)", async () => {
    const pcmBytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { data: Buffer.from(pcmBytes).toString("base64") } }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })
    await synth.synthesize({
      model: "gemini-2.5-pro-preview-tts",
      voice: "Kore",
      input: "Hello world",
      responseFormat: "wav",
      temperature: 0.15,
      seed: 7,
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.generationConfig.temperature).toBe(0.15)
    expect(body.generationConfig.seed).toBe(7)
  })

  it("finds Gemini audio when a text part appears before the audio part", async () => {
    const pcmBytes = new Uint8Array([5, 6, 7, 8])
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
                      data: Buffer.from(pcmBytes).toString("base64"),
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

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })
    const result = await synth.synthesize({
      model: "gemini-2.5-pro-preview-tts",
      voice: "Kore",
      input: "Hello again",
      responseFormat: "wav",
    })

    expect(Buffer.from(result.subarray(0, 4)).toString("ascii")).toBe("RIFF")
    expect(result.byteLength).toBe(44 + pcmBytes.byteLength)
  })

  it("retries very short Gemini text with terminal punctuation when the first response has no audio", async () => {
    const pcmBytes = new Uint8Array([9, 10, 11, 12])
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
                        mimeType: "audio/L16;rate=24000",
                        data: Buffer.from(pcmBytes).toString("base64"),
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

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })
    const result = await synth.synthesize({
      model: "gemini-2.5-pro-preview-tts",
      voice: "Kore",
      input: "یونیسف",
      responseFormat: "wav",
    })

    expect(Buffer.from(result.subarray(0, 4)).toString("ascii")).toBe("RIFF")
    expect(result.byteLength).toBe(44 + pcmBytes.byteLength)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      contents: [{ parts: [{ text: "یونیسف۔" }] }],
    })
  })

  it("rejects non-wav Gemini output requests", async () => {
    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })

    await expect(
      synth.synthesize({
        model: "gemini-2.5-pro-preview-tts",
        voice: "Kore",
        input: "Hello world",
        responseFormat: "mp3",
      })
    ).rejects.toThrow(/only supports wav output/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("surfaces a useful summary when Gemini returns text but no audio", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "The selected voice is unavailable for this request.",
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

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })

    await expect(
      synth.synthesize({
        model: "gemini-2.5-pro-preview-tts",
        voice: "Kore",
        input: "Hello world",
        responseFormat: "wav",
      })
    ).rejects.toThrow(
      /response did not include audio data\. Response summary: text="The selected voice is unavailable for this request\."/
    )
  })

  it("embeds instructions as a Director's Chair prompt when provided", async () => {
    const pcmBytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from(pcmBytes).toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })
    await synth.synthesize({
      model: "gemini-3.1-flash-tts-preview",
      voice: "Kore",
      input: "Përshëndetje!",
      responseFormat: "wav",
      instructions: "Speak with a Pristina, Kosovo accent.",
    })

    const sentText = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
      .contents[0].parts[0].text as string
    // Instructions go above the transcript delimiter, transcript below it.
    expect(sentText).toBe(
      "### PERFORMANCE\nSpeak with a Pristina, Kosovo accent.\n\n#### TRANSCRIPT\nPërshëndetje!"
    )
    // The model must never receive a systemInstruction (rejected by the TTS models).
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty(
      "systemInstruction"
    )
  })

  it("sends the bare transcript when instructions are empty or absent", async () => {
    const pcmBytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { data: Buffer.from(pcmBytes).toString("base64") } } ] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })
    await synth.synthesize({
      model: "gemini-3.1-flash-tts-preview",
      voice: "Kore",
      input: "Hello world",
      responseFormat: "wav",
      instructions: "   ",
    })

    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).contents[0].parts[0].text
    ).toBe("Hello world")
  })

  it("re-wraps the short-text punctuation retry with instructions", async () => {
    const pcmBytes = new Uint8Array([9, 10, 11, 12])
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "No audio returned." }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ inlineData: { data: Buffer.from(pcmBytes).toString("base64") } } ] } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })
    await synth.synthesize({
      model: "gemini-3.1-flash-tts-preview",
      voice: "Kore",
      input: "Po",
      responseFormat: "wav",
      instructions: "Kosovo accent.",
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Retry appends terminal punctuation to the transcript, still inside the wrapper.
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).contents[0].parts[0].text
    ).toBe("### PERFORMANCE\nKosovo accent.\n\n#### TRANSCRIPT\nPo.")
  })
})

describe("createElevenLabsTTSSynthesizer", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("calls the ElevenLabs text-to-speech endpoint and returns raw bytes for mp3", async () => {
    const mp3Bytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(mp3Bytes, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    )

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })
    const result = await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "mp3",
    })

    expect(Array.from(result)).toEqual(Array.from(mp3Bytes))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_128"
    )
    expect(init?.headers).toMatchObject({
      "xi-api-key": "el-test",
      "Content-Type": "application/json",
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: "Hello world",
      model_id: "eleven_multilingual_v2",
    })
  })

  it("sends previous_text, next_text, and apply_text_normalization when provided", async () => {
    const mp3Bytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(mp3Bytes, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    )

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })
    await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "mp3",
      elevenLabsPreviousText: "Previous sentence.",
      elevenLabsNextText: "Next sentence.",
      elevenLabsApplyTextNormalization: "on",
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: "Hello world",
      previous_text: "Previous sentence.",
      next_text: "Next sentence.",
      apply_text_normalization: "on",
    })
  })

  it("omits previous_text, next_text, and apply_text_normalization when not provided", async () => {
    const mp3Bytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(mp3Bytes, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    )

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })
    await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "mp3",
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.previous_text).toBeUndefined()
    expect(body.next_text).toBeUndefined()
    expect(body.apply_text_normalization).toBeUndefined()
  })

  it("requests raw PCM and wraps it as wav when responseFormat is wav", async () => {
    const pcmBytes = new Uint8Array([5, 6, 7, 8])
    fetchMock.mockResolvedValue(
      new Response(pcmBytes, { status: 200, headers: { "Content-Type": "application/octet-stream" } })
    )

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })
    const result = await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "wav",
    })

    expect(Buffer.from(result.subarray(0, 4)).toString("ascii")).toBe("RIFF")
    expect(result.byteLength).toBe(44 + pcmBytes.byteLength)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=pcm_24000"
    )
  })

  it("maps opus responseFormat to the ElevenLabs opus output format", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1]), { status: 200 })
    )

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })
    await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "opus",
    })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("output_format=opus_48000_128")
  })

  it("throws when no API key is available", async () => {
    const originalEnv = process.env.ELEVENLABS_API_KEY
    delete process.env.ELEVENLABS_API_KEY

    const synth = createElevenLabsTTSSynthesizer()

    await expect(
      synth.synthesize({
        model: "eleven_multilingual_v2",
        voice: "21m00Tcm4TlvDq8ikWAM",
        input: "Hello world",
        responseFormat: "mp3",
      })
    ).rejects.toThrow(/ELEVENLABS_API_KEY is required/)
    expect(fetchMock).not.toHaveBeenCalled()

    if (originalEnv !== undefined) process.env.ELEVENLABS_API_KEY = originalEnv
  })

  it("surfaces the ElevenLabs error message on a failed request", async () => {
    fetchMock.mockResolvedValue(
      new Response("invalid_api_key", { status: 401, statusText: "Unauthorized" })
    )

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-bad" })

    await expect(
      synth.synthesize({
        model: "eleven_multilingual_v2",
        voice: "21m00Tcm4TlvDq8ikWAM",
        input: "Hello world",
        responseFormat: "mp3",
      })
    ).rejects.toThrow(/ElevenLabs TTS request failed \(401\)/)
  })

  // Omitting `voice_settings` hands control to the voice's stored dashboard
  // settings, which is what let community voices inject filler sounds ("ehm").
  // The block must be present on every request.
  it("always sends voice_settings with the narration defaults", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }))

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })
    await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "mp3",
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body)).voice_settings).toEqual({
      stability: 0.7,
      similarity_boost: 0.5,
      style: 0,
      use_speaker_boost: true,
    })
  })

  it("lets explicit voice_settings overrides win over the defaults", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }))

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })
    await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "mp3",
      elevenLabsStability: 0.2,
      elevenLabsSimilarityBoost: 0.9,
      elevenLabsStyle: 0.4,
      elevenLabsUseSpeakerBoost: false,
      elevenLabsSpeed: 0.9,
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body)).voice_settings).toEqual({
      stability: 0.2,
      similarity_boost: 0.9,
      style: 0.4,
      use_speaker_boost: false,
      speed: 0.9,
    })
  })

  // `speed` has no default so an unset value leaves ElevenLabs' own pacing
  // alone rather than pinning it to 1.0.
  it("omits speed from voice_settings when it is not set", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }))

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })
    await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "mp3",
      elevenLabsStability: 0.8,
    })

    const [, init] = fetchMock.mock.calls[0]
    const settings = JSON.parse(String(init?.body)).voice_settings
    expect(settings.stability).toBe(0.8)
    expect(settings.speed).toBeUndefined()
  })

  // Falling back to mp3 for an unsupported format would write mp3 bytes into a
  // file whose extension came from the same `format` value (e.g. `.ogg`).
  it("throws instead of silently falling back to mp3 for an unsupported format", async () => {
    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })

    await expect(
      synth.synthesize({
        model: "eleven_multilingual_v2",
        voice: "21m00Tcm4TlvDq8ikWAM",
        input: "Hello world",
        responseFormat: "ogg",
      })
    ).rejects.toThrow(/does not support the "ogg" audio format/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("still accepts mp3 after the unsupported-format guard", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }))

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" }, { sampleRate: 22050 })
    await synth.synthesize({
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      input: "Hello world",
      responseFormat: "mp3",
    })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("output_format=mp3_22050_32")
  })

  it("explains the Enterprise requirement when v2.5 rejects text normalization", async () => {
    fetchMock.mockResolvedValue(
      new Response("apply_text_normalization is not supported for this model", {
        status: 400,
        statusText: "Bad Request",
      })
    )

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })

    await expect(
      synth.synthesize({
        model: "eleven_flash_v2_5",
        voice: "21m00Tcm4TlvDq8ikWAM",
        input: "Hello world",
        responseFormat: "mp3",
        elevenLabsApplyTextNormalization: "on",
      })
    ).rejects.toThrow(/requires an ElevenLabs Enterprise plan/)
  })

  it("does not add the Enterprise hint for unrelated 400s", async () => {
    fetchMock.mockResolvedValue(
      new Response("voice_not_found", { status: 400, statusText: "Bad Request" })
    )

    const synth = createElevenLabsTTSSynthesizer({ apiKey: "el-test" })

    await expect(
      synth.synthesize({
        model: "eleven_multilingual_v2",
        voice: "missing-voice",
        input: "Hello world",
        responseFormat: "mp3",
      })
    ).rejects.toThrow(/^ElevenLabs TTS request failed \(400\): voice_not_found$/)
  })
})

describe("transcribeWithWhisper", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const transcriptionResponse = () =>
    new Response(
      JSON.stringify({
        text: "vera",
        duration: 0.9,
        words: [{ word: "vera", start: 0, end: 0.9 }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )

  it("retries without the language hint when the API rejects it with a 400", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("Invalid language 'sq'. Supported languages are: ...", {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(transcriptionResponse())

    const result = await transcribeWithWhisper(
      Buffer.from([1, 2, 3, 4]),
      "pg016017_p007.mp3",
      "sk-test",
      "sq",
      "VERA",
    )

    expect(result.words).toEqual([{ word: "vera", start: 0, end: 0.9 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // First attempt carries the language hint; the retry drops it.
    const firstBody = fetchMock.mock.calls[0]?.[1]?.body as FormData
    const retryBody = fetchMock.mock.calls[1]?.[1]?.body as FormData
    expect(firstBody.get("language")).toBe("sq")
    expect(retryBody.has("language")).toBe(false)
    // The prompt is preserved across the retry.
    expect(retryBody.get("prompt")).toBe("VERA")
  })

  it("does not retry (and surfaces the error) on a non-language failure", async () => {
    fetchMock.mockResolvedValue(
      new Response("incorrect api key provided", { status: 401 }),
    )

    await expect(
      transcribeWithWhisper(Buffer.from([1]), "x.mp3", "sk-bad", "sq"),
    ).rejects.toThrow(/Whisper transcription failed \(401\)/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("succeeds on the first call without retrying when the language is accepted", async () => {
    fetchMock.mockResolvedValue(transcriptionResponse())

    const result = await transcribeWithWhisper(
      Buffer.from([1, 2]),
      "y.mp3",
      "sk-test",
      "en",
    )

    expect(result.duration).toBe(0.9)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
