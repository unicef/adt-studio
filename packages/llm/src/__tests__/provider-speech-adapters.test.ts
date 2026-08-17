import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BackendContext } from "../ports/common.js"
import { AiProviderError } from "../ports/errors.js"
import { azureProvider } from "../providers/azure/index.js"
import { geminiProvider } from "../providers/gemini/index.js"
import { openaiProvider } from "../providers/openai/index.js"
import { elevenLabsProvider } from "../providers/elevenlabs/index.js"

function context<C>(providerId: string, modelId: string, credentials: C): BackendContext<C> {
  return { providerId, modelId, modality: "tts", credentials }
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("azure speech adapter", () => {
  const synth = () =>
    azureProvider.createSpeechSynthesizer!(
      context("azure", "azure-tts", { apiKey: "az-key", region: "brazilsouth" }),
    )

  it("delegates to the legacy synthesizer with an escaped SSML voice name", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2]), { status: 200 }))

    const result = await synth().synthesize({
      text: "Tom & Jerry",
      voice: "pt-BR-<Francisca>&Neural",
      format: "mp3",
      sampleRate: 48000,
      bitRate: "96kbitrate",
    })

    expect(result.format).toBe("mp3")
    expect(result.mimeType).toBe("audio/mpeg")
    expect(Array.from(result.audio)).toEqual([1, 2])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://brazilsouth.tts.speech.microsoft.com/cognitiveservices/v1")
    expect(init?.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "az-key",
      "X-Microsoft-OutputFormat": "audio-48khz-96kbitrate-mono-mp3",
    })
    expect(String(init?.body)).toContain(
      "<voice name='pt-BR-&lt;Francisca&gt;&amp;Neural'>Tom &amp; Jerry</voice>",
    )
  })

  it("rejects formats outside the manifest capabilities before any request", async () => {
    await expect(
      synth().synthesize({ text: "Hi", voice: "v", format: "wav" }),
    ).rejects.toThrow(AiProviderError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("gemini speech adapter", () => {
  const synth = () =>
    geminiProvider.createSpeechSynthesizer!(
      context("gemini", "gemini-2.5-pro-preview-tts", { apiKey: "gm-key" }),
    )

  it("delegates to the legacy synthesizer, forwarding instructions, temperature, and seed", async () => {
    const pcmBytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { data: Buffer.from(pcmBytes).toString("base64") } }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    const result = await synth().synthesize({
      text: "Hello world",
      voice: "Kore",
      format: "wav",
      instructions: "Kosovo accent.",
      temperature: 0.15,
      seed: 7,
    })

    expect(result.format).toBe("wav")
    expect(result.mimeType).toBe("audio/wav")
    expect(Buffer.from(result.audio.subarray(0, 4)).toString("ascii")).toBe("RIFF")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent",
    )
    const body = JSON.parse(String(init?.body))
    expect(body.contents[0].parts[0].text).toBe(
      "### PERFORMANCE\nKosovo accent.\n\n#### TRANSCRIPT\nHello world",
    )
    expect(body.generationConfig.temperature).toBe(0.15)
    expect(body.generationConfig.seed).toBe(7)
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore")
  })

  it("rejects formats outside the manifest capabilities before any request", async () => {
    await expect(
      synth().synthesize({ text: "Hi", voice: "Kore", format: "mp3" }),
    ).rejects.toThrow(AiProviderError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("openai speech adapter", () => {
  const synth = () =>
    openaiProvider.createSpeechSynthesizer!(
      context("openai", "gpt-4o-mini-tts", { apiKey: "sk-test" }),
    )

  it("delegates to the legacy synthesizer at the OpenAI base URL", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([9]), { status: 200 }))

    const result = await synth().synthesize({
      text: "Hello world",
      voice: "alloy",
      format: "mp3",
      instructions: "Speak slowly.",
    })

    expect(result.format).toBe("mp3")
    expect(result.mimeType).toBe("audio/mpeg")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.openai.com/v1/audio/speech")
    expect(init?.headers).toMatchObject({ Authorization: "Bearer sk-test" })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: "Hello world",
      response_format: "mp3",
      instructions: "Speak slowly.",
    })
  })

  it("omits instructions when the request does not carry any", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([9]), { status: 200 }))

    await synth().synthesize({ text: "Hello", voice: "alloy", format: "mp3" })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).not.toHaveProperty("instructions")
  })

  it("rejects formats outside the manifest capabilities before any request", async () => {
    await expect(
      synth().synthesize({ text: "Hi", voice: "alloy", format: "ogg" }),
    ).rejects.toThrow(AiProviderError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("elevenlabs speech adapter", () => {
  const synth = () =>
    elevenLabsProvider.createSpeechSynthesizer!(
      context("elevenlabs", "eleven_multilingual_v2", { apiKey: "el-test" }),
    )

  it("forwards known voice-steering providerOptions to the legacy synthesizer", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }))

    await synth().synthesize({
      text: "Hello world",
      voice: "21m00Tcm4TlvDq8ikWAM",
      format: "mp3",
      providerOptions: {
        stability: 0.2,
        similarityBoost: 0.9,
        style: 0.4,
        useSpeakerBoost: false,
        speed: 0.9,
        previousText: "Previous sentence.",
        nextText: "Next sentence.",
        applyTextNormalization: "on",
      },
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.voice_settings).toEqual({
      stability: 0.2,
      similarity_boost: 0.9,
      style: 0.4,
      use_speaker_boost: false,
      speed: 0.9,
    })
    expect(body.previous_text).toBe("Previous sentence.")
    expect(body.next_text).toBe("Next sentence.")
    expect(body.apply_text_normalization).toBe("on")
  })

  it("ignores unknown and mistyped providerOptions keys", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }))

    await synth().synthesize({
      text: "Hello world",
      voice: "21m00Tcm4TlvDq8ikWAM",
      format: "mp3",
      providerOptions: {
        stability: "very stable",
        useSpeakerBoost: "yes",
        applyTextNormalization: "sometimes",
        somethingElse: 42,
      },
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.voice_settings).toEqual({
      stability: 0.7,
      similarity_boost: 0.5,
      style: 0,
      use_speaker_boost: true,
    })
    expect(body.previous_text).toBeUndefined()
    expect(body.apply_text_normalization).toBeUndefined()
    expect(body.somethingElse).toBeUndefined()
  })
})
