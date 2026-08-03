import { z } from "zod"
import type { ProviderManifest, TtsCapabilities } from "@adt/types"
import type {
  ProviderModule,
  SpeechResult,
  SpeechSynthesisRequest,
  SpeechSynthesizer,
} from "../../ports/index.js"
import { AiProviderError } from "../../ports/errors.js"
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

const MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  opus: "audio/ogg",
}

function buildOutputFormat(
  format: string,
  sampleRate?: number,
  bitRate?: string,
): string {
  const srKhz = Math.round((sampleRate ?? 24000) / 1000)
  if (format === "opus") return `ogg-${srKhz}khz-16bit-mono-opus`
  return `audio-${srKhz}khz-${bitRate ?? "48kbitrate"}-mono-mp3`
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function buildSSML(voice: string, text: string): string {
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${escapeXml(voice)}'>${escapeXml(text)}</voice></speak>`
}

function assertFormat(modelId: string, format: string, capabilities: TtsCapabilities): void {
  if (!capabilities.formats.includes(format)) {
    throw AiProviderError.unsupportedCapability(
      AZURE_PROVIDER_ID,
      "tts",
      `format:${format}`,
      modelId,
    )
  }
}

function createAzureSpeechSynthesizer(
  modelId: string,
  credentials: AzureCredentials,
  capabilities: TtsCapabilities,
): SpeechSynthesizer {
  const endpoint = `https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/v1`

  return {
    async synthesize(request: SpeechSynthesisRequest): Promise<SpeechResult> {
      const format = request.format.toLowerCase()
      assertFormat(modelId, format, capabilities)

      const outputFormat = buildOutputFormat(format, request.sampleRate, request.bitRate)

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": credentials.apiKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": outputFormat,
        },
        body: buildSSML(request.voice, request.text),
        signal: request.signal,
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(
          `Azure TTS request failed (${response.status}): ${message || response.statusText}`,
        )
      }

      const audio = new Uint8Array(await response.arrayBuffer())
      return { audio, format, mimeType: MIME_TYPES[format] ?? "application/octet-stream" }
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
