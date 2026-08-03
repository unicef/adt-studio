import { z } from "zod"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { AiModality, ProviderManifest } from "@adt/types"
import type { DiscoveredModel, ProviderModule } from "../../ports/index.js"
import { createAiSdkStructuredTextBackend } from "../shared/ai-sdk/structured-text.js"
import { createAiSdkAgentBackend } from "../shared/ai-sdk/agent.js"
import { ModelDiscoveryError } from "../../model-discovery.js"
import { LABEL_API_KEY } from "../shared/i18n.js"

export const GOOGLE_PROVIDER_ID = "google"
const ADAPTER_VERSION = "google-1"
const GOOGLE_MODELS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
const DISCOVERY_TIMEOUT_MS = 15_000

const credentialSchema = z
  .object({ apiKey: z.string().min(1).max(400) })
  .transform((values) => ({ apiKey: values.apiKey }))

/**
 * Deliberately NOT an alias of the `gemini` TTS provider: merging them would
 * break the existing headers and storage keys of both.
 */
export const googleManifest: ProviderManifest = {
  id: GOOGLE_PROVIDER_ID,
  displayName: "Google",
  modalities: ["structured-text", "agent"],
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
  },
  defaultModels: {
    "structured-text": "gemini-2.5-pro",
    agent: "gemini-2.5-pro",
  },
  docsUrl: "https://aistudio.google.com/apikey",
}

type GoogleCredentials = z.infer<typeof credentialSchema>

const GoogleModelsResponse = z.object({
  models: z
    .array(
      z
        .object({
          name: z.string().min(1),
          displayName: z.string().min(1).optional(),
          supportedGenerationMethods: z.array(z.string()).optional(),
        })
        .passthrough(),
    )
    .default([]),
})

function modalitiesForMethods(methods: string[] | undefined): AiModality[] | undefined {
  if (!methods) return undefined
  const modalities: AiModality[] = []
  if (methods.includes("generateContent")) {
    modalities.push("structured-text", "agent")
  }
  return modalities.length > 0 ? modalities : undefined
}

async function listGoogleModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const timeout = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(GOOGLE_MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json", "x-goog-api-key": apiKey },
      signal: combined,
    })
  } catch {
    throw new ModelDiscoveryError("unreachable", "Could not reach the Google model listing")
  }

  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? "missing-credential"
        : "unreachable"
    throw new ModelDiscoveryError(code, `Model listing failed with HTTP ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ModelDiscoveryError("invalid-response", "Model listing returned invalid JSON")
  }

  const parsed = GoogleModelsResponse.safeParse(payload)
  if (!parsed.success) {
    throw new ModelDiscoveryError("invalid-response", "Unexpected model listing shape")
  }

  const seen = new Set<string>()
  const models: DiscoveredModel[] = []
  for (const entry of parsed.data.models) {
    const id = entry.name.replace(/^models\//, "")
    if (!id || seen.has(id)) continue
    seen.add(id)
    const modalities = modalitiesForMethods(entry.supportedGenerationMethods)
    models.push({
      id,
      ...(entry.displayName ? { displayName: entry.displayName } : {}),
      ...(modalities ? { modalities } : {}),
    })
  }
  return models
}

export const googleProvider: ProviderModule<GoogleCredentials> = {
  manifest: googleManifest,
  credentialSchema,

  resolveServerCredentials: () => ({
    apiKey:
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY,
  }),

  cacheFingerprint: () => ({
    adapterVersion: ADAPTER_VERSION,
    origin: "https://generativelanguage.googleapis.com",
  }),

  listModels: (context) => listGoogleModels(context.credentials.apiKey, context.signal),

  createStructuredTextBackend: (context) => {
    const client = createGoogleGenerativeAI({ apiKey: context.credentials.apiKey })
    return createAiSdkStructuredTextBackend(() => client(context.modelId))
  },

  createAgentBackend: (context) =>
    createAiSdkAgentBackend(
      createGoogleGenerativeAI({ apiKey: context.credentials.apiKey })(context.modelId),
    ),
}
