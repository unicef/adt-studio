import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createGeminiTTSSynthesizer, transcribeWithWhisper } from "../speech.js"

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
    expect(JSON.parse(String(init?.body))).toMatchObject({
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
