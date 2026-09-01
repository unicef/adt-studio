import fs from "node:fs"
import { Hono } from "hono"
import yaml from "js-yaml"
import {
  AI_MODALITIES,
  AppConfig,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  ModelDiscoveryResponse,
  ProviderHealthResponse,
  ProvidersResponse,
  normalizeModelId,
  type AiModality,
} from "@adt/types"
import {
  checkProviderConnection,
  discoverModels,
  getDefaultProviderRegistry,
  type ProviderRegistry,
} from "@adt/llm"
import { readProviderCredentials } from "../middleware/provider-credentials.js"
import { DEFAULT_AGENT_MODEL } from "../services/agents-service.js"

const OPENAI_TRANSCRIPTION_MODEL_ID = "openai:whisper-1"

function safeNormalize(rawModelId: string | undefined): string | undefined {
  if (!rawModelId) return undefined
  try {
    return normalizeModelId(rawModelId)
  } catch {
    return undefined
  }
}

/**
 * The speech stage routes synthesis to `speech.default_provider`, so tts
 * availability must gate on that provider — not on the OpenAI-era model
 * fields. The model part is informational: voice-driven providers (azure)
 * declare no model id and fall through to the literal "default".
 */
function resolveTtsDefault(
  config: ReturnType<typeof AppConfig.parse> | undefined,
  registry: ProviderRegistry,
): string {
  const provider = config?.speech?.default_provider?.trim() || "openai"
  const model =
    config?.speech?.model ??
    config?.default_speech_generation_model ??
    registry.modules().find((m) => m.manifest.id === provider)?.manifest.defaultModels?.tts ??
    "default"
  return safeNormalize(`${provider}:${model}`) ?? normalizeModelId(DEFAULT_OPENAI_TTS_MODEL_ID)
}

function resolveDefaults(
  configPath: string,
  registry: ProviderRegistry,
): Partial<Record<AiModality, string>> {
  let config: ReturnType<typeof AppConfig.parse> | undefined
  if (fs.existsSync(configPath)) {
    try {
      config = AppConfig.parse(yaml.load(fs.readFileSync(configPath, "utf-8")))
    } catch {
      config = undefined
    }
  }

  const defaults: Partial<Record<AiModality, string>> = {
    "structured-text":
      safeNormalize(config?.default_model) ?? normalizeModelId(DEFAULT_LLM_MODEL_ID),
    // agents-service ignores default_model on purpose (its prompts are tuned
    // for DEFAULT_AGENT_MODEL), so the advertised default must match what a
    // run would actually resolve.
    agent: safeNormalize(config?.agents?.model) ?? normalizeModelId(DEFAULT_AGENT_MODEL),
    image:
      safeNormalize(config?.default_image_generation_model) ??
      normalizeModelId(DEFAULT_IMAGE_GENERATION_MODEL_ID),
    tts: resolveTtsDefault(config, registry),
    stt: OPENAI_TRANSCRIPTION_MODEL_ID,
  }

  return defaults
}

/** Public catalogue: manifests and configuration state only, never a credential value. */
export function createProviderRoutes(
  configPath: string,
  registry: ProviderRegistry = getDefaultProviderRegistry(),
): Hono {
  const app = new Hono()

  app.get("/providers", (c) => {
    const payload = ProvidersResponse.parse({
      providers: registry.descriptors(),
      defaults: resolveDefaults(configPath, registry),
    })
    return c.json(payload)
  })

  app.get("/providers/:id/models", async (c) => {
    const providerId = c.req.param("id")
    if (!registry.has(providerId)) {
      return c.json({ error: `Unknown provider "${providerId}"` }, 404)
    }

    const modalityParam = c.req.query("modality")
    if (
      modalityParam !== undefined &&
      !(AI_MODALITIES as readonly string[]).includes(modalityParam)
    ) {
      return c.json({ error: `Invalid modality "${modalityParam}"` }, 400)
    }

    const result = await discoverModels(registry, providerId, {
      credentials: readProviderCredentials(c, registry),
      modality: modalityParam as AiModality | undefined,
    })

    return c.json(ModelDiscoveryResponse.parse(result))
  })

  app.get("/providers/:id/health", async (c) => {
    const providerId = c.req.param("id")
    if (!registry.has(providerId)) {
      return c.json({ error: `Unknown provider "${providerId}"` }, 404)
    }

    const result = await checkProviderConnection(registry, providerId, {
      credentials: readProviderCredentials(c, registry),
    })

    return c.json(ProviderHealthResponse.parse(result))
  })

  return app
}
