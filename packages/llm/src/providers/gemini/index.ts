import { z } from "zod"
import type { ProviderManifest, TtsCapabilities } from "@adt/types"
import type {
  ProviderModule,
  SpeechResult,
  SpeechSynthesisRequest,
  SpeechSynthesizer,
} from "../../ports/index.js"
import { createGeminiTTSSynthesizer } from "../../speech.js"
import {
  assertFormatSupported,
  audioMimeType,
} from "../shared/openai-rest/speech.js"
import { LABEL_API_KEY } from "../shared/i18n.js"

export const GEMINI_PROVIDER_ID = "gemini"
const ADAPTER_VERSION = "gemini-tts-1"
const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com"

const GEMINI_FLASH_RPM = 150
const GEMINI_PRO_RPM = 125
const GEMINI_UNKNOWN_RPM = 100

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

/**
 * Adapts the legacy `TTSSynthesizer` the speech pipeline still constructs
 * directly, so the generateContent request, the short-text retry, and the
 * PCM→WAV wrapping live in exactly one place.
 */
function createGeminiSpeechSynthesizer(
  modelId: string,
  credentials: GeminiCredentials,
  capabilities: TtsCapabilities,
): SpeechSynthesizer {
  return {
    async synthesize(request: SpeechSynthesisRequest): Promise<SpeechResult> {
      const format = request.format.toLowerCase()
      assertFormatSupported(GEMINI_PROVIDER_ID, modelId, format, capabilities)

      const audio = await createGeminiTTSSynthesizer({
        apiKey: credentials.apiKey,
      }).synthesize({
        model: modelId,
        voice: request.voice,
        input: request.text,
        responseFormat: format,
        ...(request.instructions !== undefined
          ? { instructions: request.instructions }
          : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.seed !== undefined ? { seed: request.seed } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
      })

      return { audio, format, mimeType: audioMimeType(format) }
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
