import { z } from "zod"
import { createAnthropic } from "@ai-sdk/anthropic"
import type { ProviderManifest } from "@adt/types"
import type { DiscoveredModel, ProviderModule } from "../../ports/index.js"
import { createAiSdkStructuredTextBackend } from "../shared/ai-sdk/structured-text.js"
import { createAiSdkAgentBackend } from "../shared/ai-sdk/agent.js"
import { ModelDiscoveryError } from "../../model-discovery.js"
import { LABEL_API_KEY } from "../shared/i18n.js"

export const ANTHROPIC_PROVIDER_ID = "anthropic"
const ADAPTER_VERSION = "anthropic-1"
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models?limit=1000"
const ANTHROPIC_VERSION = "2023-06-01"
const DISCOVERY_TIMEOUT_MS = 15_000

const credentialSchema = z
  .object({ apiKey: z.string().min(1).max(400) })
  .transform((values) => ({ apiKey: values.apiKey }))

export const anthropicManifest: ProviderManifest = {
  id: ANTHROPIC_PROVIDER_ID,
  displayName: "Anthropic",
  modalities: ["structured-text", "agent"],
  credentialFields: [
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: true,
      header: "X-Anthropic-API-Key",
      legacyHeaders: [],
      storageKey: "adt-studio-anthropic-key",
      legacyStorageKeys: [],
      placeholder: "sk-ant-...",
    },
  ],
  capabilities: {
    "structured-text": {
      // Anthropic has no strict server-side JSON schema mode; the SDK reaches
      // structured output through a tool call, which handles recursion fine.
      strategies: ["tool-call", "json-mode"],
      recursiveSchemas: true,
      imageInput: true,
      temperature: true,
    },
    agent: { tools: true, streaming: true },
  },
  defaultModels: {
    "structured-text": "claude-opus-4",
    agent: "claude-opus-4",
  },
  docsUrl: "https://console.anthropic.com/settings/keys",
}

type AnthropicCredentials = z.infer<typeof credentialSchema>

const AnthropicModelsResponse = z.object({
  data: z
    .array(
      z
        .object({ id: z.string().min(1), display_name: z.string().min(1).optional() })
        .passthrough(),
    )
    .default([]),
})

async function listAnthropicModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const timeout = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(ANTHROPIC_MODELS_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      signal: combined,
    })
  } catch {
    throw new ModelDiscoveryError("unreachable", "Could not reach the Anthropic model listing")
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

  const parsed = AnthropicModelsResponse.safeParse(payload)
  if (!parsed.success) {
    throw new ModelDiscoveryError("invalid-response", "Unexpected model listing shape")
  }

  return parsed.data.data.map((entry) => ({
    id: entry.id,
    ...(entry.display_name ? { displayName: entry.display_name } : {}),
  }))
}

export const anthropicProvider: ProviderModule<AnthropicCredentials> = {
  manifest: anthropicManifest,
  credentialSchema,

  resolveServerCredentials: () => ({ apiKey: process.env.ANTHROPIC_API_KEY }),

  cacheFingerprint: () => ({
    adapterVersion: ADAPTER_VERSION,
    origin: "https://api.anthropic.com",
  }),

  listModels: (context) => listAnthropicModels(context.credentials.apiKey, context.signal),

  createStructuredTextBackend: (context) => {
    const client = createAnthropic({ apiKey: context.credentials.apiKey })
    return createAiSdkStructuredTextBackend(() => client(context.modelId))
  },

  createAgentBackend: (context) =>
    createAiSdkAgentBackend(
      createAnthropic({ apiKey: context.credentials.apiKey })(context.modelId),
    ),
}
