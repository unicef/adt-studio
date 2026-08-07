import { z } from "zod"
import { DEFAULT_ELEVENLABS_TTS_MODEL_ID, type ProviderManifest } from "@adt/types"
import type {
  ProviderModule,
  SpeechResult,
  SpeechSynthesisRequest,
  SpeechSynthesizer,
} from "../../ports/index.js"
import { createElevenLabsTTSSynthesizer } from "../../speech.js"
import {
  assertFormatSupported,
  audioMimeType,
} from "../shared/openai-rest/speech.js"
import { LABEL_API_KEY } from "../shared/i18n.js"

export const ELEVENLABS_PROVIDER_ID = "elevenlabs"
const ADAPTER_VERSION = "elevenlabs-tts-1"
const ELEVENLABS_ORIGIN = "https://api.elevenlabs.io"

const credentialSchema = z
  .object({ apiKey: z.string().min(1).max(400) })
  .transform((values) => ({ apiKey: values.apiKey }))

type ElevenLabsCredentials = z.infer<typeof credentialSchema>

export const elevenLabsManifest: ProviderManifest = {
  id: ELEVENLABS_PROVIDER_ID,
  displayName: "ElevenLabs",
  modalities: ["tts"],
  credentialFields: [
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: true,
      header: "X-ElevenLabs-API-Key",
      legacyHeaders: [],
      storageKey: "adt-studio-elevenlabs-key",
      legacyStorageKeys: [],
    },
  ],
  capabilities: {
    tts: {
      formats: ["mp3", "opus", "wav", "pcm"],
      voices: [],
      languages: [],
      instructions: false,
      rateLimitMode: "fixed",
    },
  },
  defaultModels: {
    tts: DEFAULT_ELEVENLABS_TTS_MODEL_ID,
  },
  localizedHelp: {
    en: "Multilingual voices via the ElevenLabs REST API. The voice is a voice id rather than a name, and delivery is steered by per-voice settings instead of free-text instructions.",
    "pt-BR":
      "Vozes multilíngues via API REST do ElevenLabs. A voz é um id de voz, não um nome, e a entonação é controlada por configurações por voz em vez de instruções em texto livre.",
    es: "Voces multilingües mediante la API REST de ElevenLabs. La voz es un id de voz en lugar de un nombre, y la entrega se controla con ajustes por voz en vez de instrucciones de texto libre.",
    fr: "Voix multilingues via l'API REST ElevenLabs. La voix est un identifiant de voix plutôt qu'un nom, et le rendu est piloté par des réglages par voix au lieu d'instructions en texte libre.",
    sq: "Zëra shumëgjuhësh përmes API-t REST të ElevenLabs. Zëri është një id zëri dhe nuk është emër, dhe paraqitja drejtohet nga cilësimet për çdo zë në vend të udhëzimeve me tekst të lirë.",
  },
  docsUrl: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
}

/**
 * Adapts the legacy `TTSSynthesizer` the speech pipeline still constructs
 * directly, so the REST call, the output-format snapping tables and the voice
 * settings live in exactly one place.
 */
function createElevenLabsSpeechSynthesizer(
  modelId: string,
  credentials: ElevenLabsCredentials,
): SpeechSynthesizer {
  return {
    async synthesize(request: SpeechSynthesisRequest): Promise<SpeechResult> {
      const format = request.format.toLowerCase()
      assertFormatSupported(
        ELEVENLABS_PROVIDER_ID,
        modelId,
        format,
        elevenLabsManifest.capabilities.tts!,
      )

      const audio = await createElevenLabsTTSSynthesizer(
        { apiKey: credentials.apiKey },
        {
          ...(request.sampleRate !== undefined ? { sampleRate: request.sampleRate } : {}),
          ...(request.bitRate !== undefined ? { bitRate: request.bitRate } : {}),
        },
      ).synthesize({
        model: modelId,
        voice: request.voice,
        input: request.text,
        responseFormat: format,
        ...(request.signal ? { signal: request.signal } : {}),
      })

      return { audio, format, mimeType: audioMimeType(format) }
    },
  }
}

export const elevenLabsProvider: ProviderModule<ElevenLabsCredentials> = {
  manifest: elevenLabsManifest,
  credentialSchema,

  resolveServerCredentials: () => ({
    apiKey: process.env.ELEVENLABS_API_KEY,
  }),

  cacheFingerprint: () => ({
    adapterVersion: ADAPTER_VERSION,
    origin: ELEVENLABS_ORIGIN,
  }),

  createSpeechSynthesizer: (context) =>
    createElevenLabsSpeechSynthesizer(context.modelId, context.credentials),
}
