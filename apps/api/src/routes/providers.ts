import fs from "node:fs"
import { Hono } from "hono"
import yaml from "js-yaml"
import { z } from "zod"
import {
  AI_MODALITIES,
  AppConfig,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  ModelDiscoveryResponse,
  ProviderCliLoginStatus,
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
import {
  CliLoginUnsupportedError,
  createCliLoginService,
  type CliLoginService,
} from "../services/cli-login-service.js"
import {
  agentModelForDefaultModel,
  DEFAULT_AGENT_MODEL,
} from "../services/agents-service.js"

const OPENAI_TRANSCRIPTION_MODEL_ID = "openai:whisper-1"
export const CLI_ACTION_HEADER = "X-ADT-CLI-Action"
export const CLI_ACTION_HEADER_VALUE = "1"

const CliActionHeader = z.literal(CLI_ACTION_HEADER_VALUE)

export interface ProviderRouteOptions {
  /** The browser OAuth callback is usable only when Studio and the API run locally. */
  cliLoginEnabled?: boolean
}

function cliLoginEnabledByDefault(): boolean {
  return process.env.ADT_ENVIRONMENT === "electron" || process.env.NODE_ENV !== "production"
}

function hasValidCliActionHeader(value: string | undefined): boolean {
  return CliActionHeader.safeParse(value).success
}

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
    // Mirrors agents-service's resolution chain (agents.model, then the
    // default model's provider, then DEFAULT_AGENT_MODEL) so the advertised
    // default matches what a run would actually resolve.
    agent:
      safeNormalize(config?.agents?.model) ??
      safeNormalize(agentModelForDefaultModel(config?.default_model)) ??
      normalizeModelId(DEFAULT_AGENT_MODEL),
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
  cliLogins: CliLoginService = createCliLoginService(registry),
  options: ProviderRouteOptions = {},
): Hono {
  const app = new Hono()
  const cliLoginEnabled = options.cliLoginEnabled ?? cliLoginEnabledByDefault()
  const supportsCliLogin = (providerId: string) =>
    cliLoginEnabled && cliLogins.supports(providerId)

  app.get("/providers", (c) => {
    const payload = ProvidersResponse.parse({
      providers: registry.descriptors().map((provider) => ({
        ...provider,
        supportsCliLogin: cliLoginEnabled && provider.supportsCliLogin === true,
      })),
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

  // Studio-driven CLI sign-in. The payload carries only the sign-in URL for
  // the user to open; the CLI keeps the resulting tokens.
  app.post("/providers/:id/cli-login", async (c) => {
    const providerId = c.req.param("id")
    if (!registry.has(providerId)) {
      return c.json({ error: `Unknown provider "${providerId}"` }, 404)
    }
    if (!supportsCliLogin(providerId)) {
      return c.json({ error: `Provider "${providerId}" has no CLI sign-in` }, 400)
    }
    if (!hasValidCliActionHeader(c.req.header(CLI_ACTION_HEADER))) {
      return c.json({ error: `A valid ${CLI_ACTION_HEADER} header is required` }, 403)
    }
    const status = await cliLogins.start(providerId, readProviderCredentials(c, registry))
    return c.json(ProviderCliLoginStatus.parse(status))
  })

  app.get("/providers/:id/cli-login", (c) => {
    const providerId = c.req.param("id")
    if (!registry.has(providerId)) {
      return c.json({ error: `Unknown provider "${providerId}"` }, 404)
    }
    if (!supportsCliLogin(providerId)) {
      return c.json({ error: `Provider "${providerId}" has no CLI sign-in` }, 400)
    }
    return c.json(ProviderCliLoginStatus.parse(cliLogins.status(providerId)))
  })

  app.delete("/providers/:id/cli-login", (c) => {
    const providerId = c.req.param("id")
    if (!registry.has(providerId)) {
      return c.json({ error: `Unknown provider "${providerId}"` }, 404)
    }
    if (!supportsCliLogin(providerId)) {
      return c.json({ error: `Provider "${providerId}" has no CLI sign-in` }, 400)
    }
    if (!hasValidCliActionHeader(c.req.header(CLI_ACTION_HEADER))) {
      return c.json({ error: `A valid ${CLI_ACTION_HEADER} header is required` }, 403)
    }
    return c.json(ProviderCliLoginStatus.parse(cliLogins.cancel(providerId)))
  })

  app.post("/providers/:id/cli-logout", async (c) => {
    const providerId = c.req.param("id")
    if (!registry.has(providerId)) {
      return c.json({ error: `Unknown provider "${providerId}"` }, 404)
    }
    if (!supportsCliLogin(providerId)) {
      return c.json({ error: `Provider "${providerId}" has no CLI sign-in` }, 400)
    }
    if (!hasValidCliActionHeader(c.req.header(CLI_ACTION_HEADER))) {
      return c.json({ error: `A valid ${CLI_ACTION_HEADER} header is required` }, 403)
    }
    try {
      await cliLogins.logout(providerId, readProviderCredentials(c, registry))
    } catch (error) {
      if (error instanceof CliLoginUnsupportedError) return c.json({ error: error.message }, 400)
      const message = error instanceof Error ? error.message : String(error)
      return c.json({ error: message }, 500)
    }
    return c.json({ ok: true })
  })

  return app
}
