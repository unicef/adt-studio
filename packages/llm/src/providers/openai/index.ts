import { z } from "zod"
import type { ProviderManifest, StructuredTextCapabilities } from "@adt/types"
import type { BackendContext, ProviderModule } from "../../ports/index.js"
import { createAiSdkStructuredTextBackend } from "../shared/ai-sdk/structured-text.js"
import { createAiSdkAgentBackend } from "../shared/ai-sdk/agent.js"
import { createOpenAiImageBackend } from "../shared/openai-rest/image.js"
import {
  createOpenAiSpeechSynthesizer,
  createOpenAiTranscriber,
} from "../shared/openai-rest/speech.js"
import { listOpenAiCompatibleModels } from "../shared/openai-rest/models.js"
import { LABEL_API_KEY } from "../shared/i18n.js"
import { createOpenAI } from "@ai-sdk/openai"

export const OPENAI_PROVIDER_ID = "openai"
export const OPENAI_API_BASE_URL = "https://api.openai.com/v1"
const ADAPTER_VERSION = "openai-1"

const credentialSchema = z
  .object({ apiKey: z.string().min(1).max(400) })
  .transform((values) => ({ apiKey: values.apiKey }))

export const openaiManifest: ProviderManifest = {
  id: OPENAI_PROVIDER_ID,
  displayName: "OpenAI",
  modalities: ["structured-text", "agent", "image", "tts", "stt"],
  credentialFields: [
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: true,
      header: "X-OpenAI-Key",
      legacyHeaders: ["X-ADT-OpenAI-Key"],
      storageKey: "adt-studio-openai-key",
      legacyStorageKeys: [],
      placeholder: "sk-...",
    },
  ],
  capabilities: {
    "structured-text": {
      // Preference order: strict server-side schema first, then JSON mode for
      // recursive schemas that strict mode rejects.
      strategies: ["native-schema", "json-mode", "tool-call"],
      recursiveSchemas: false,
      imageInput: true,
      temperature: true,
    },
    agent: { tools: true, streaming: true },
    image: {
      generate: true,
      edit: true,
      // Empty = accept any size; the API is the authority on which its models take.
      sizes: [],
      mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    },
    tts: {
      formats: ["mp3", "opus", "aac", "flac", "wav", "pcm"],
      voices: [
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "fable",
        "nova",
        "onyx",
        "sage",
        "shimmer",
      ],
      languages: [],
      instructions: true,
      rateLimitMode: "fixed",
    },
    stt: {
      wordTimestamps: true,
      inputFormats: ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg", "flac"],
      languageHint: true,
    },
  },
  defaultModels: {
    "structured-text": "gpt-5.4",
    agent: "gpt-5.4",
    image: "gpt-image-2",
    tts: "gpt-4o-mini-tts",
    stt: "whisper-1",
  },
  docsUrl: "https://platform.openai.com/api-keys",
}

type OpenAiCredentials = z.infer<typeof credentialSchema>

/**
 * Reasoning models (gpt-5.x, o-series) reject a `temperature` other than the
 * default, so the capability is reported per model rather than per provider.
 */
function structuredTextCapabilitiesFor(modelId: string): StructuredTextCapabilities {
  const base = openaiManifest.capabilities["structured-text"]!
  const isReasoning = /^(gpt-5|o[1-9])/i.test(modelId)
  return isReasoning ? { ...base, temperature: false } : base
}

export const openaiProvider: ProviderModule<OpenAiCredentials> = {
  manifest: openaiManifest,
  credentialSchema,

  resolveServerCredentials: () => ({ apiKey: process.env.OPENAI_API_KEY }),

  capabilitiesFor: (modality, modelId) =>
    modality === "structured-text"
      ? (structuredTextCapabilitiesFor(modelId) as never)
      : undefined,

  cacheFingerprint: () => ({
    adapterVersion: ADAPTER_VERSION,
    origin: "https://api.openai.com",
  }),

  listModels: (context) =>
    listOpenAiCompatibleModels({
      baseUrl: OPENAI_API_BASE_URL,
      apiKey: context.credentials.apiKey,
      signal: context.signal,
    }),

  createStructuredTextBackend: (context) => {
    const client = createOpenAI({ apiKey: context.credentials.apiKey })
    return createAiSdkStructuredTextBackend((options) =>
      client(
        context.modelId,
        options.structuredOutputs !== undefined
          ? { structuredOutputs: options.structuredOutputs }
          : undefined,
      ),
    )
  },

  createAgentBackend: (context) =>
    createAiSdkAgentBackend(
      createOpenAI({ apiKey: context.credentials.apiKey })(context.modelId),
    ),

  createImageBackend: (context: BackendContext<OpenAiCredentials>) =>
    createOpenAiImageBackend({
      providerId: OPENAI_PROVIDER_ID,
      modelId: context.modelId,
      apiKey: context.credentials.apiKey,
      baseUrl: OPENAI_API_BASE_URL,
      capabilities: openaiManifest.capabilities.image!,
    }),

  createSpeechSynthesizer: (context) =>
    createOpenAiSpeechSynthesizer({
      providerId: OPENAI_PROVIDER_ID,
      modelId: context.modelId,
      apiKey: context.credentials.apiKey,
      baseUrl: OPENAI_API_BASE_URL,
      capabilities: openaiManifest.capabilities.tts!,
    }),

  createTranscriber: (context) =>
    createOpenAiTranscriber({
      providerId: OPENAI_PROVIDER_ID,
      modelId: context.modelId,
      apiKey: context.credentials.apiKey,
      baseUrl: OPENAI_API_BASE_URL,
      capabilities: openaiManifest.capabilities.stt!,
    }),
}
