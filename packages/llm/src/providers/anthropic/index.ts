import { z } from "zod"
import { createAnthropic } from "@ai-sdk/anthropic"
import type { ProviderManifest } from "@adt/types"
import type { CapabilitiesFor, ProviderModule } from "../../ports/index.js"
import { createAiSdkStructuredTextBackend } from "../shared/ai-sdk/structured-text.js"
import { createAiSdkAgentBackend } from "../shared/ai-sdk/agent.js"
import { claudeModelRules, claudeTimeoutMs, withClaudeModelRules } from "./claude-models.js"
import {
  ANTHROPIC_ORIGIN,
  listAnthropicModels,
} from "../shared/anthropic-rest/models.js"
import { LABEL_API_KEY } from "../shared/i18n.js"

export const ANTHROPIC_PROVIDER_ID = "anthropic"
const ADAPTER_VERSION = "anthropic-1"

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
    "structured-text": "claude-opus-4-6",
    agent: "claude-opus-4-6",
  },
  docsUrl: "https://console.anthropic.com/settings/keys",
}

type AnthropicCredentials = z.infer<typeof credentialSchema>

export const anthropicProvider: ProviderModule<AnthropicCredentials> = {
  manifest: anthropicManifest,
  credentialSchema,

  resolveServerCredentials: () => ({ apiKey: process.env.ANTHROPIC_API_KEY }),

  capabilitiesFor: (modality, modelId) =>
    modality === "structured-text" && claudeModelRules(modelId).rejectsSampling
      ? ({
          ...anthropicManifest.capabilities["structured-text"]!,
          temperature: false,
        } as CapabilitiesFor<typeof modality>)
      : undefined,

  cacheFingerprint: () => ({
    adapterVersion: ADAPTER_VERSION,
    origin: ANTHROPIC_ORIGIN,
  }),

  listModels: (context) =>
    listAnthropicModels({ apiKey: context.credentials.apiKey, signal: context.signal }),

  createStructuredTextBackend: (context) => {
    const client = createAnthropic({ apiKey: context.credentials.apiKey })
    const backend = createAiSdkStructuredTextBackend(() =>
      withClaudeModelRules(context.modelId, client(context.modelId)),
    )
    return {
      generateStructured: (request) =>
        backend.generateStructured({
          ...request,
          timeoutMs: claudeTimeoutMs(context.modelId, request.timeoutMs),
        }),
    }
  },

  createAgentBackend: (context) => {
    const backend = createAiSdkAgentBackend(
      withClaudeModelRules(
        context.modelId,
        createAnthropic({ apiKey: context.credentials.apiKey })(context.modelId),
      ),
    )
    return {
      generateTurn: (request) =>
        backend.generateTurn({
          ...request,
          timeoutMs: claudeTimeoutMs(context.modelId, request.timeoutMs),
        }),
    }
  },
}
