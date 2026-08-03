import { z } from "zod"
import type { ProviderManifest, StructuredTextCapabilities } from "@adt/types"
import type { ProviderModule } from "../../ports/index.js"
import { createOpenAiCompatibleModule } from "../shared/openai-compatible/index.js"
import { EndpointUrl } from "../shared/endpoint.js"
import { HELP_OPTIONAL_API_KEY, LABEL_API_KEY, LABEL_BASE_URL } from "../shared/i18n.js"

export const CUSTOM_PROVIDER_ID = "custom"
const ADAPTER_VERSION = "openai-compatible-1"

const credentialSchema = z
  .object({
    baseUrl: EndpointUrl,
    apiKey: z.string().max(400).optional().default(""),
  })
  .transform((values) => ({ baseUrl: values.baseUrl, apiKey: values.apiKey }))

type CustomCredentials = z.infer<typeof credentialSchema>

export const customManifest: ProviderManifest = {
  id: CUSTOM_PROVIDER_ID,
  displayName: "Custom (OpenAI-compatible)",
  modalities: ["structured-text", "agent"],
  credentialFields: [
    {
      key: "baseUrl",
      kind: "url",
      label: LABEL_BASE_URL,
      required: true,
      header: "X-Custom-Base-URL",
      legacyHeaders: [],
      storageKey: "adt-studio-custom-base-url",
      legacyStorageKeys: [],
      placeholder: "http://localhost:1234/v1",
    },
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: false,
      header: "X-Custom-API-Key",
      legacyHeaders: [],
      storageKey: "adt-studio-custom-api-key",
      legacyStorageKeys: [],
      help: HELP_OPTIONAL_API_KEY,
    },
  ],
  capabilities: {
    "structured-text": {
      // A self-hosted server may or may not honour a JSON schema, so the
      // fallback chain ends in client-side parsing with one repair round.
      strategies: ["json-mode", "tool-call", "parse-repair"],
      recursiveSchemas: true,
      imageInput: false,
      temperature: true,
    },
    // Tool calling is not guaranteed by an arbitrary OpenAI-compatible server;
    // capabilitiesFor() reports it per model and resolveAgent() rejects a model
    // that cannot run an agent loop.
    agent: { tools: false, streaming: false },
  },
  defaultModels: {},
  localizedHelp: {
    en: "Any OpenAI-compatible server (LM Studio, vLLM, llama.cpp). Image, speech and transcription endpoints are not assumed to exist.",
    "pt-BR":
      "Qualquer servidor compatível com a API da OpenAI (LM Studio, vLLM, llama.cpp). Endpoints de imagem, fala e transcrição não são presumidos.",
    es: "Cualquier servidor compatible con OpenAI (LM Studio, vLLM, llama.cpp). No se asume que existan endpoints de imagen, voz o transcripción.",
    fr: "Tout serveur compatible OpenAI (LM Studio, vLLM, llama.cpp). Les points d'accès image, voix et transcription ne sont pas supposés exister.",
    sq: "Çdo server i përputhshëm me OpenAI (LM Studio, vLLM, llama.cpp). Endpointet e imazhit, të zërit dhe të transkriptimit nuk supozohen se ekzistojnë.",
  },
}

const TOOL_CAPABLE_MODEL_PATTERN =
  /(gpt|claude|llama-?3|llama3|qwen|mistral|mixtral|command-r|hermes|firefunction|functionary|devstral|deepseek)/i

function structuredTextFor(modelId: string): StructuredTextCapabilities {
  const base = customManifest.capabilities["structured-text"]!
  return TOOL_CAPABLE_MODEL_PATTERN.test(modelId)
    ? base
    : { ...base, strategies: ["json-mode", "parse-repair"] }
}

export const customProvider: ProviderModule<CustomCredentials> =
  createOpenAiCompatibleModule<CustomCredentials>({
    manifest: customManifest,
    credentialSchema,
    adapterVersion: ADAPTER_VERSION,
    resolveServerCredentials: () => ({
      baseUrl: process.env.CUSTOM_OPENAI_BASE_URL,
      apiKey: process.env.CUSTOM_OPENAI_API_KEY,
    }),
    resolveEndpoint: (credentials) => ({
      baseURL: credentials.baseUrl,
      apiKey: credentials.apiKey,
    }),
    capabilitiesFor: (modality, modelId) => {
      if (modality === "structured-text") return structuredTextFor(modelId) as never
      if (modality === "agent") {
        return {
          tools: TOOL_CAPABLE_MODEL_PATTERN.test(modelId),
          streaming: false,
        } as never
      }
      return undefined
    },
  })
