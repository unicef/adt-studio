import { z } from "zod"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { ProviderManifest } from "@adt/types"
import { DEFAULT_GOOGLE_IMAGE_MODEL } from "@adt/types"
import type { CapabilitiesFor, ProviderModule } from "../../ports/index.js"
import { AiProviderError } from "../../ports/errors.js"
import { createAiSdkStructuredTextBackend } from "../shared/ai-sdk/structured-text.js"
import { isGemini4Model, withGemini4Params } from "./gemini-4.js"
import { createAiSdkAgentBackend } from "../shared/ai-sdk/agent.js"
import { LABEL_API_KEY } from "../shared/i18n.js"
import { createGoogleImageBackend, googleImageCapabilities, isGoogleImageModel } from "./image.js"
import { listGoogleModels } from "./discovery.js"

export const GOOGLE_PROVIDER_ID = "google"
const ADAPTER_VERSION = "google-1"

const credentialSchema = z
  .object({ apiKey: z.string().min(1).max(400) })
  .transform((values) => ({ apiKey: values.apiKey }))

/**
 * Deliberately NOT an alias of the `gemini` TTS provider: merging them would
 * break the existing headers and storage keys of both. The TTS provider
 * instead declares its key as `sharedWith` this one, so a single Google AI
 * Studio key still covers text, image and speech.
 */
export const googleManifest: ProviderManifest = {
  id: GOOGLE_PROVIDER_ID,
  displayName: "Google",
  modalities: ["structured-text", "agent", "image"],
  credentialFields: [
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: true,
      header: "X-Google-API-Key",
      legacyHeaders: [],
      storageKey: "adt-studio-google-key",
      legacyStorageKeys: [],
    },
  ],
  capabilities: {
    "structured-text": {
      strategies: ["native-schema", "json-mode", "tool-call"],
      recursiveSchemas: false,
      imageInput: true,
      temperature: true,
    },
    agent: { tools: true, streaming: true },
    image: googleImageCapabilities(DEFAULT_GOOGLE_IMAGE_MODEL),
  },
  defaultModels: {
    "structured-text": "gemini-2.5-pro",
    // Gemini 2.5 Pro is unavailable to new API users even though existing
    // projects may retain access. Google's error response and current model
    // catalogue direct agentic workloads to this tool-capable replacement.
    agent: "gemini-3.1-pro-preview",
    image: DEFAULT_GOOGLE_IMAGE_MODEL,
  },
  docsUrl: "https://aistudio.google.com/apikey",
}

type GoogleCredentials = z.infer<typeof credentialSchema>

export const googleProvider: ProviderModule<GoogleCredentials> = {
  manifest: googleManifest,
  credentialSchema,

  resolveServerCredentials: () => ({
    apiKey:
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY,
  }),

  cacheFingerprint: (context) => ({
    adapterVersion: context.modality === "image" ? "google-image-1" : ADAPTER_VERSION,
    origin: "https://generativelanguage.googleapis.com",
  }),

  listModels: (context) => listGoogleModels(context.credentials.apiKey, context.signal),

  capabilitiesFor: (modality, modelId) => {
    if (isGoogleImageModel(modelId) && modality !== "image") {
      throw AiProviderError.unsupportedCapability("google", modality, "image-only model", modelId)
    }
    if (modality === "image") return googleImageCapabilities(modelId) as CapabilitiesFor<typeof modality>
    if (modality === "structured-text" && isGemini4Model(modelId)) {
      return {
        ...googleManifest.capabilities["structured-text"]!,
        temperature: false,
      } as CapabilitiesFor<typeof modality>
    }
    return undefined
  },

  createImageBackend: (context) => createGoogleImageBackend(context.modelId, context.credentials.apiKey),

  createStructuredTextBackend: (context) => {
    const client = createGoogleGenerativeAI({ apiKey: context.credentials.apiKey })
    return createAiSdkStructuredTextBackend((options) =>
      withGemini4Params(
        context.modelId,
        client(
          context.modelId,
          options.structuredOutputs !== undefined
            ? { structuredOutputs: options.structuredOutputs }
            : undefined,
        ),
      ),
    )
  },

  createAgentBackend: (context) =>
    createAiSdkAgentBackend(
      withGemini4Params(
        context.modelId,
        createGoogleGenerativeAI({ apiKey: context.credentials.apiKey })(context.modelId),
      ),
    ),
}
