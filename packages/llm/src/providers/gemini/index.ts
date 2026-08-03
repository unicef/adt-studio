import { z } from "zod"
import type { ProviderManifest, TtsCapabilities } from "@adt/types"
import type {
  ProviderModule,
  SpeechResult,
  SpeechSynthesisRequest,
  SpeechSynthesizer,
} from "../../ports/index.js"
import { AiProviderError } from "../../ports/errors.js"
import { LABEL_API_KEY } from "../shared/i18n.js"

export const GEMINI_PROVIDER_ID = "gemini"
const ADAPTER_VERSION = "gemini-tts-1"
const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com"

const GEMINI_FLASH_RPM = 150
const GEMINI_PRO_RPM = 125
const GEMINI_UNKNOWN_RPM = 100

const PCM_SAMPLE_RATE = 24_000
const PCM_CHANNELS = 1
const PCM_BITS_PER_SAMPLE = 16

const credentialSchema = z
  .object({ apiKey: z.string().min(1).max(400) })
  .transform((values) => ({ apiKey: values.apiKey }))

type GeminiCredentials = z.infer<typeof credentialSchema>

export const geminiManifest: ProviderManifest = {
  id: GEMINI_PROVIDER_ID,
  displayName: "Gemini Speech",
  modalities: ["tts"],
  credentialFields: [
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: true,
      header: "X-Gemini-API-Key",
      legacyHeaders: [],
      storageKey: "adt-studio-gemini-key",
      legacyStorageKeys: [],
    },
  ],
  capabilities: {
    tts: {
      formats: ["wav", "pcm"],
      voices: [],
      languages: [],
      instructions: true,
      defaultRequestsPerMinute: GEMINI_UNKNOWN_RPM,
      rateLimitMode: "adaptive",
    },
  },
  defaultModels: {},
  localizedHelp: {
    en: "Native Gemini speech models. Only wav/pcm output; the documented request ceiling is only a starting point, so the rate limiter self-tunes.",
    "pt-BR":
      "Modelos nativos de fala do Gemini. Apenas saída wav/pcm; o limite documentado de requisições é só um ponto de partida, então o limitador se auto-ajusta.",
    es: "Modelos nativos de voz de Gemini. Solo salida wav/pcm; el límite documentado de solicitudes es solo un punto de partida, así que el limitador se autoajusta.",
    fr: "Modèles vocaux natifs de Gemini. Sortie wav/pcm uniquement ; le plafond de requêtes documenté n'est qu'un point de départ, le limiteur s'auto-ajuste.",
    sq: "Modele native të të folurit të Gemini. Vetëm dalje wav/pcm; kufiri i dokumentuar i kërkesave është vetëm një pikënisje, ndaj kufizuesi vetë-rregullohet.",
  },
  docsUrl: "https://ai.google.dev/gemini-api/docs/speech-generation",
}

const MIME_TYPES: Record<string, string> = {
  wav: "audio/wav",
  pcm: "audio/L16",
}

function documentedRequestsPerMinute(modelId: string): number {
  const normalized = modelId.toLowerCase()
  if (normalized.includes("flash")) return GEMINI_FLASH_RPM
  if (normalized.includes("pro")) return GEMINI_PRO_RPM
  return GEMINI_UNKNOWN_RPM
}

function ttsCapabilitiesFor(modelId: string): TtsCapabilities {
  return {
    ...geminiManifest.capabilities.tts!,
    defaultRequestsPerMinute: documentedRequestsPerMinute(modelId),
  }
}

interface GeminiInlineData {
  data?: string
  mimeType?: string
}

interface GeminiGenerateContentPayload {
  error?: { message?: string } | string
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: GeminiInlineData }> }
  }>
}

function wrapPcmAsWave(pcmBytes: Uint8Array): Uint8Array {
  const header = Buffer.alloc(44)
  const byteRate = PCM_SAMPLE_RATE * PCM_CHANNELS * (PCM_BITS_PER_SAMPLE / 8)
  const blockAlign = PCM_CHANNELS * (PCM_BITS_PER_SAMPLE / 8)
  const dataSize = pcmBytes.byteLength

  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(PCM_CHANNELS, 22)
  header.writeUInt32LE(PCM_SAMPLE_RATE, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)

  return new Uint8Array(Buffer.concat([header, Buffer.from(pcmBytes)]))
}

function extractAudioData(payload: GeminiGenerateContentPayload): string | null {
  let fallback: string | null = null

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inlineData = part.inlineData
      if (!inlineData?.data) continue

      const mimeType = inlineData.mimeType?.toLowerCase()
      if (mimeType?.startsWith("audio/")) return inlineData.data
      if (!mimeType && !fallback) fallback = inlineData.data
    }
  }

  return fallback
}

function summarizeResponse(payload: GeminiGenerateContentPayload): string | null {
  const details: string[] = []

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const text = part.text?.trim()
      if (text) {
        details.push(`text="${text.slice(0, 160)}"`)
        continue
      }

      const mimeType = part.inlineData?.mimeType?.trim()
      if (mimeType) details.push(`inlineData mimeType=${mimeType}`)
      else if (part.inlineData?.data) details.push("inlineData without mimeType")
    }
  }

  return details.length === 0 ? null : details.slice(0, 3).join("; ")
}

/**
 * Very short unpunctuated input sometimes returns no audio at all. Adding a
 * script-appropriate terminator makes the model treat it as an utterance.
 */
function buildShortTextRetryInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (Array.from(trimmed).length > 10) return null
  if (/[.!?؟۔。！？।]$/u.test(trimmed)) return null

  const suffix =
    /\p{Script=Arabic}/u.test(trimmed) ? "۔"
      : /\p{Script=Devanagari}/u.test(trimmed) ? "।"
        : /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(trimmed) ? "。"
          : "."

  return `${trimmed}${suffix}`
}

/**
 * Native speech models reject `systemInstruction` at the API schema level, so
 * style steering must live inside the prompt. The `#### TRANSCRIPT` delimiter
 * keeps the performance notes from being read aloud.
 */
function buildSpeechPrompt(transcript: string, instructions?: string): string {
  const performance = instructions?.trim()
  if (!performance) return transcript
  return `### PERFORMANCE\n${performance}\n\n#### TRANSCRIPT\n${transcript}`
}

function createGeminiSpeechSynthesizer(
  modelId: string,
  credentials: GeminiCredentials,
  capabilities: TtsCapabilities,
): SpeechSynthesizer {
  const url = `${GEMINI_ORIGIN}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`

  return {
    async synthesize(request: SpeechSynthesisRequest): Promise<SpeechResult> {
      const format = request.format.toLowerCase()
      if (!capabilities.formats.includes(format)) {
        throw AiProviderError.unsupportedCapability(
          GEMINI_PROVIDER_ID,
          "tts",
          `format:${request.format}`,
          modelId,
        )
      }

      const post = async (transcript: string): Promise<GeminiGenerateContentPayload> => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": credentials.apiKey,
          },
          body: JSON.stringify({
            contents: [
              { parts: [{ text: buildSpeechPrompt(transcript, request.instructions) }] },
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              ...(request.temperature !== undefined
                ? { temperature: request.temperature }
                : {}),
              ...(request.seed !== undefined ? { seed: request.seed } : {}),
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: request.voice } },
              },
            },
          }),
          signal: request.signal,
        })

        const responseText = await response.text()
        const payload = ((): GeminiGenerateContentPayload => {
          try {
            return JSON.parse(responseText) as GeminiGenerateContentPayload
          } catch {
            return { error: responseText || response.statusText }
          }
        })()

        if (!response.ok) {
          const message =
            typeof payload.error === "string"
              ? payload.error
              : payload.error?.message ?? response.statusText
          throw new Error(
            `Gemini TTS request failed (${response.status}): ${message || response.statusText}`,
          )
        }

        return payload
      }

      let payload = await post(request.text)
      let audioData = extractAudioData(payload)

      if (!audioData) {
        const retryInput = buildShortTextRetryInput(request.text)
        if (retryInput) {
          payload = await post(retryInput)
          audioData = extractAudioData(payload)
        }
      }

      if (!audioData) {
        const summary = summarizeResponse(payload)
        throw new Error(
          summary
            ? `Gemini TTS response did not include audio data. Response summary: ${summary}`
            : "Gemini TTS response did not include audio data",
        )
      }

      const pcmBytes = new Uint8Array(Buffer.from(audioData, "base64"))
      return {
        audio: format === "pcm" ? pcmBytes : wrapPcmAsWave(pcmBytes),
        format,
        mimeType: MIME_TYPES[format]!,
      }
    },
  }
}

export const geminiProvider: ProviderModule<GeminiCredentials> = {
  manifest: geminiManifest,
  credentialSchema,

  resolveServerCredentials: () => ({ apiKey: process.env.GEMINI_API_KEY }),

  capabilitiesFor: (modality, modelId) =>
    modality === "tts" ? (ttsCapabilitiesFor(modelId) as never) : undefined,

  cacheFingerprint: () => ({ adapterVersion: ADAPTER_VERSION, origin: GEMINI_ORIGIN }),

  createSpeechSynthesizer: (context) =>
    createGeminiSpeechSynthesizer(
      context.modelId,
      context.credentials,
      ttsCapabilitiesFor(context.modelId),
    ),
}
