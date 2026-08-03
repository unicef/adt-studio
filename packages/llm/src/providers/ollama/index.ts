import { z } from "zod"
import type { ProviderManifest, StructuredTextCapabilities } from "@adt/types"
import type { ProviderModule } from "../../ports/index.js"
import { createOpenAiCompatibleModule } from "../shared/openai-compatible/index.js"
import { EndpointUrl } from "../shared/endpoint.js"
import { LABEL_BASE_URL } from "../shared/i18n.js"

export const OLLAMA_PROVIDER_ID = "ollama"
const ADAPTER_VERSION = "ollama-1"

/**
 * Only a sensible starting point, not a promise. `localhost` resolves inside the
 * API container under Docker and inside the Electron main process on desktop —
 * see docs/AI_PROVIDERS.md for the per-deployment guidance.
 */
export const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1"

const credentialSchema = z
  .object({
    baseUrl: EndpointUrl.optional().default(OLLAMA_DEFAULT_BASE_URL),
    apiKey: z.string().max(400).optional().default(""),
  })
  .transform((values) => ({
    baseUrl: values.baseUrl || OLLAMA_DEFAULT_BASE_URL,
    apiKey: values.apiKey,
  }))

type OllamaCredentials = z.infer<typeof credentialSchema>

export const ollamaManifest: ProviderManifest = {
  id: OLLAMA_PROVIDER_ID,
  displayName: "Ollama",
  modalities: ["structured-text", "agent"],
  credentialFields: [
    {
      key: "baseUrl",
      kind: "url",
      // Not required: an empty value falls back to the local default.
      label: LABEL_BASE_URL,
      required: false,
      header: "X-ADT-Provider-Ollama-Base-URL",
      legacyHeaders: [],
      storageKey: "adt-studio-ollama-base-url",
      legacyStorageKeys: [],
      placeholder: OLLAMA_DEFAULT_BASE_URL,
      help: {
        en: "Defaults to http://127.0.0.1:11434/v1. In Docker, localhost is the container — use host.docker.internal or the host IP.",
        "pt-BR":
          "Padrão http://127.0.0.1:11434/v1. No Docker, localhost é o container — use host.docker.internal ou o IP do host.",
        es: "Predeterminado http://127.0.0.1:11434/v1. En Docker, localhost es el contenedor — use host.docker.internal o la IP del host.",
        fr: "Par défaut http://127.0.0.1:11434/v1. Dans Docker, localhost désigne le conteneur — utilisez host.docker.internal ou l'IP de l'hôte.",
        sq: "Parazgjedhja http://127.0.0.1:11434/v1. Në Docker, localhost është kontejneri — përdorni host.docker.internal ose IP-në e hostit.",
      },
    },
  ],
  capabilities: {
    "structured-text": {
      strategies: ["json-mode", "parse-repair"],
      recursiveSchemas: true,
      imageInput: false,
      temperature: true,
    },
    agent: { tools: false, streaming: false },
  },
  defaultModels: {},
  localizedHelp: {
    en: "Runs models locally with no API key. Structured output falls back to client-side parsing when a model has no reliable JSON mode.",
    "pt-BR":
      "Executa modelos localmente sem chave de API. A saída estruturada recorre à análise no cliente quando o modelo não tem um modo JSON confiável.",
    es: "Ejecuta modelos localmente sin clave de API. La salida estructurada recurre al análisis en el cliente cuando el modelo no tiene un modo JSON fiable.",
    fr: "Exécute des modèles en local sans clé d'API. La sortie structurée bascule vers une analyse côté client quand le modèle n'a pas de mode JSON fiable.",
    sq: "Ekzekuton modele lokalisht pa kyç API. Dalja e strukturuar kthehet në analizë në klient kur modeli nuk ka një mode JSON të besueshëm.",
  },
  docsUrl: "https://ollama.com/library",
}

/** Models known to implement the OpenAI tool-calling protocol under Ollama. */
const TOOL_CAPABLE_MODEL_PATTERN =
  /(llama-?3\.[1-9]|llama-?4|qwen[23]|qwen-?[23]\.?\d*|mistral|mixtral|command-r|hermes3|firefunction|devstral|deepseek-?v3|gpt-oss)/i

/** Small models where even Ollama's `format: json` is unreliable. */
const JSON_MODE_UNRELIABLE_PATTERN = /(:0\.5b|:1b|:1\.5b|:2b|tinyllama|phi-?2|gemma:2b)/i

function structuredTextFor(modelId: string): StructuredTextCapabilities {
  const base = ollamaManifest.capabilities["structured-text"]!
  if (JSON_MODE_UNRELIABLE_PATTERN.test(modelId)) {
    return { ...base, strategies: ["parse-repair"] }
  }
  return TOOL_CAPABLE_MODEL_PATTERN.test(modelId)
    ? { ...base, strategies: ["json-mode", "tool-call", "parse-repair"] }
    : base
}

export const ollamaProvider: ProviderModule<OllamaCredentials> =
  createOpenAiCompatibleModule<OllamaCredentials>({
    manifest: ollamaManifest,
    credentialSchema,
    adapterVersion: ADAPTER_VERSION,
    resolveServerCredentials: () => ({
      baseUrl: process.env.OLLAMA_BASE_URL,
      apiKey: process.env.OLLAMA_API_KEY,
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
