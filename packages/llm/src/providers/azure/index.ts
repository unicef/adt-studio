import { z } from "zod"
import type { ProviderManifest, TtsCapabilities } from "@adt/types"
import type {
  ProviderModule,
  SpeechResult,
  SpeechSynthesisRequest,
  SpeechSynthesizer,
} from "../../ports/index.js"
import { createAzureTTSSynthesizer } from "../../speech.js"
import {
  assertFormatSupported,
  audioMimeType,
} from "../shared/openai-rest/speech.js"
import { LABEL_API_KEY, LABEL_REGION } from "../shared/i18n.js"

export const AZURE_PROVIDER_ID = "azure"
const ADAPTER_VERSION = "azure-speech-1"

const REGION_PATTERN = /^[a-z][a-z0-9-]{1,63}$/

const credentialSchema = z
  .object({
    apiKey: z.string().min(1).max(400),
    region: z
      .string()
      .trim()
      .toLowerCase()
      .regex(REGION_PATTERN, "invalid Azure region"),
  })
  .transform((values) => ({ apiKey: values.apiKey, region: values.region }))

type AzureCredentials = z.infer<typeof credentialSchema>

export const azureManifest: ProviderManifest = {
  id: AZURE_PROVIDER_ID,
  displayName: "Azure Speech",
  modalities: ["tts"],
  credentialFields: [
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: true,
      header: "X-Azure-Speech-Key",
      legacyHeaders: [],
      storageKey: "adt-studio-azure-key",
      legacyStorageKeys: [],
    },
    {
      key: "region",
      kind: "text",
      label: LABEL_REGION,
      required: true,
      header: "X-Azure-Speech-Region",
      legacyHeaders: [],
      storageKey: "adt-studio-azure-region",
      legacyStorageKeys: [],
      placeholder: "brazilsouth",
      pattern: REGION_PATTERN.source,
      maxLength: 64,
    },
  ],
  capabilities: {
    tts: {
      formats: ["mp3", "opus"],
      voices: [],
      languages: [],
      instructions: false,
      rateLimitMode: "fixed",
    },
  },
  defaultModels: {},
  localizedHelp: {
    en: "Neural voices via the Azure Speech REST API. The voice name carries the language (e.g. pt-BR-FranciscaNeural); style steering is not supported.",
    "pt-BR":
      "Vozes neurais via API REST do Azure Speech. O nome da voz carrega o idioma (ex.: pt-BR-FranciscaNeural); orientação de estilo não é suportada.",
    es: "Voces neuronales mediante la API REST de Azure Speech. El nombre de la voz incluye el idioma (p. ej. pt-BR-FranciscaNeural); no admite indicaciones de estilo.",
    fr: "Voix neuronales via l'API REST Azure Speech. Le nom de la voix porte la langue (par ex. pt-BR-FranciscaNeural) ; le pilotage du style n'est pas pris en charge.",
    sq: "Zëra neuralë përmes API-t REST të Azure Speech. Emri i zërit përmban gjuhën (p.sh. pt-BR-FranciscaNeural); udhëzimet e stilit nuk mbështeten.",
  },
  docsUrl:
    "https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech",
}

/**
 * Adapts the legacy `TTSSynthesizer` the speech pipeline still constructs
 * directly, so the SSML construction (voice/text escaping) and the Azure REST
 * call live in exactly one place.
 */
function createAzureSpeechSynthesizer(
  modelId: string,
  credentials: AzureCredentials,
  capabilities: TtsCapabilities,
): SpeechSynthesizer {
  return {
    async synthesize(request: SpeechSynthesisRequest): Promise<SpeechResult> {
      const format = request.format.toLowerCase()
      assertFormatSupported(AZURE_PROVIDER_ID, modelId, format, capabilities)

      const audio = await createAzureTTSSynthesizer(
        { subscriptionKey: credentials.apiKey, region: credentials.region },
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

export const azureProvider: ProviderModule<AzureCredentials> = {
  manifest: azureManifest,
  credentialSchema,

  resolveServerCredentials: () => ({
    apiKey: process.env.AZURE_SPEECH_KEY,
    region: process.env.AZURE_SPEECH_REGION,
  }),

  cacheFingerprint: (context) => ({
    adapterVersion: ADAPTER_VERSION,
    origin: `https://${context.credentials.region}.tts.speech.microsoft.com`,
  }),

  createSpeechSynthesizer: (context) =>
    createAzureSpeechSynthesizer(
      context.modelId,
      context.credentials,
      azureManifest.capabilities.tts!,
    ),
}
