import { createOpenAI } from "@ai-sdk/openai"
import type { z } from "zod"
import type { ProviderManifest } from "@adt/types"
import type {
  BackendContext,
  CacheFingerprint,
  ProviderCredentialValues,
  ProviderModule,
} from "../../../ports/index.js"
import {
  createAiSdkStructuredTextBackend,
  type AiSdkModelOptions,
} from "../ai-sdk/structured-text.js"
import { createAiSdkAgentBackend } from "../ai-sdk/agent.js"
import { createOpenAiImageBackend } from "../openai-rest/image.js"
import { listOpenAiCompatibleModels } from "../openai-rest/models.js"
import { validateEndpointUrl } from "../endpoint.js"

export const OPENAI_DEFAULT_ORIGIN = "https://api.openai.com"

export interface OpenAiCompatibleEndpoint {
  /** Undefined means the SDK's own default (api.openai.com). */
  baseURL?: string
  apiKey?: string
}

/** "none" is beyond the SDK's union but accepted by runtimes such as Ollama. */
export type ReasoningEffort = "none" | "low" | "medium" | "high"

export interface OpenAiCompatibleConfig<C extends ProviderCredentialValues> {
  manifest: ProviderManifest
  credentialSchema: z.ZodType<C, z.ZodTypeDef, unknown>
  resolveServerCredentials?: () => Partial<Record<string, string>>
  /** Turn validated credentials into an HTTP endpoint. */
  resolveEndpoint: (credentials: C) => OpenAiCompatibleEndpoint
  /** Bump when the request shape changes in a way that invalidates cached results. */
  adapterVersion: string
  capabilitiesFor?: ProviderModule<C>["capabilitiesFor"]
  /**
   * Sent as `reasoning_effort` on every chat completion. Thinking models
   * otherwise spend the whole `max_tokens` budget on reasoning and return an
   * empty, unparseable body with `finish_reason: length`.
   */
  reasoningEffortFor?: (modelId: string) => ReasoningEffort | undefined
  /** Extra non-secret cache discriminators. */
  fingerprintExtra?: (credentials: C) => Record<string, string | number | boolean>
}

/** Internal family factory — `openai-compatible` is not itself a provider id. */
export function createOpenAiCompatibleModule<C extends ProviderCredentialValues>(
  config: OpenAiCompatibleConfig<C>,
): ProviderModule<C> {
  const modalities = config.manifest.modalities

  const endpointFor = (credentials: C): OpenAiCompatibleEndpoint => {
    const endpoint = config.resolveEndpoint(credentials)
    if (endpoint.baseURL) {
      return { ...endpoint, baseURL: validateEndpointUrl(endpoint.baseURL).url }
    }
    return endpoint
  }

  const clientFor = (credentials: C) => {
    const endpoint = endpointFor(credentials)
    return createOpenAI({
      ...(endpoint.baseURL ? { baseURL: endpoint.baseURL } : {}),
      // Local runtimes accept any bearer token but the SDK requires a value.
      apiKey: endpoint.apiKey || "unused",
    })
  }

  const module: ProviderModule<C> = {
    manifest: config.manifest,
    credentialSchema: config.credentialSchema,
    resolveServerCredentials: config.resolveServerCredentials,
    capabilitiesFor: config.capabilitiesFor,

    cacheFingerprint: (context: BackendContext<C>): CacheFingerprint => {
      const endpoint = endpointFor(context.credentials)
      const origin = endpoint.baseURL
        ? validateEndpointUrl(endpoint.baseURL).origin
        : OPENAI_DEFAULT_ORIGIN
      const extra = config.fingerprintExtra?.(context.credentials)
      return {
        adapterVersion: config.adapterVersion,
        origin,
        configurableOrigin: true,
        ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
      }
    },

    listModels: (context) => {
      const endpoint = endpointFor(context.credentials)
      return listOpenAiCompatibleModels({
        baseUrl: endpoint.baseURL ?? `${OPENAI_DEFAULT_ORIGIN}/v1`,
        apiKey: endpoint.apiKey,
        signal: context.signal,
      })
    },
  }

  const chatSettingsFor = (modelId: string, options: AiSdkModelOptions = {}) => {
    const settings: Record<string, unknown> = {}
    if (options.structuredOutputs !== undefined) {
      settings.structuredOutputs = options.structuredOutputs
    }
    const reasoningEffort = config.reasoningEffortFor?.(modelId)
    if (reasoningEffort) settings.reasoningEffort = reasoningEffort
    return Object.keys(settings).length > 0
      ? (settings as Parameters<ReturnType<typeof createOpenAI>>[1])
      : undefined
  }

  if (modalities.includes("structured-text")) {
    module.createStructuredTextBackend = (context) => {
      const client = clientFor(context.credentials)
      return createAiSdkStructuredTextBackend((options) =>
        client(context.modelId, chatSettingsFor(context.modelId, options)),
      )
    }
  }

  if (modalities.includes("agent")) {
    module.createAgentBackend = (context) =>
      createAiSdkAgentBackend(
        clientFor(context.credentials)(
          context.modelId,
          chatSettingsFor(context.modelId),
        ),
      )
  }

  if (modalities.includes("image")) {
    module.createImageBackend = (context) => {
      const endpoint = endpointFor(context.credentials)
      const capabilities =
        config.capabilitiesFor?.("image", context.modelId, context.credentials) ??
        config.manifest.capabilities.image
      return createOpenAiImageBackend({
        modelId: context.modelId,
        apiKey: endpoint.apiKey ?? "",
        baseUrl: endpoint.baseURL ?? `${OPENAI_DEFAULT_ORIGIN}/v1`,
        providerId: context.providerId,
        capabilities: capabilities ?? {
          generate: true,
          edit: true,
          sizes: [],
          mimeTypes: ["image/png"],
        },
      })
    }
  }

  return module
}
