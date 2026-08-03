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
  ProvidersResponse,
  normalizeModelId,
  type AiModality,
} from "@adt/types"
import {
  discoverModels,
  getDefaultProviderRegistry,
  type ProviderRegistry,
} from "@adt/llm"
import { readProviderCredentials } from "../middleware/provider-credentials.js"

const OPENAI_TRANSCRIPTION_MODEL_ID = "openai:whisper-1"

function safeNormalize(rawModelId: string | undefined): string | undefined {
  if (!rawModelId) return undefined
  try {
    return normalizeModelId(rawModelId)
  } catch {
    return undefined
  }
}

function resolveDefaults(configPath: string): Partial<Record<AiModality, string>> {
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
    agent:
      safeNormalize(config?.agents?.model) ??
      safeNormalize(config?.default_model) ??
      normalizeModelId(DEFAULT_LLM_MODEL_ID),
    image:
      safeNormalize(config?.default_image_generation_model) ??
      normalizeModelId(DEFAULT_IMAGE_GENERATION_MODEL_ID),
    tts:
      safeNormalize(config?.default_speech_generation_model) ??
      normalizeModelId(DEFAULT_OPENAI_TTS_MODEL_ID),
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
      defaults: resolveDefaults(configPath),
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

  return app
}
