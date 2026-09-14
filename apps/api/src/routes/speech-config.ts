import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { Hono } from "hono"
import yaml from "js-yaml"
import { z } from "zod"
import {
  VoicesConfig,
  normalizeVoiceMapEntry,
  parseVoicesConfigEntries,
  type VoiceMapEntry,
} from "@adt/types"

/** Subset of ElevenLabs' `GET /v2/voices` response we surface to the UI. The
 *  upstream payload also carries sample URLs, sharing metadata and settings we
 *  have no use for, so it is never passed through verbatim. */
const ElevenLabsVoice = z.object({
  voice_id: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  verified_languages: z
    .array(z.object({ language: z.string().optional(), accent: z.string().optional() }))
    .optional(),
})
export type ElevenLabsVoice = z.infer<typeof ElevenLabsVoice>

const ElevenLabsVoicesResponse = z.object({
  voices: z.array(ElevenLabsVoice).optional(),
  has_more: z.boolean().optional(),
  next_page_token: z.string().nullish(),
})

const ELEVENLABS_VOICES_PAGE_SIZE = 100
// Enough for any realistic workspace; bounds a pathological pagination loop.
const ELEVENLABS_VOICES_MAX_PAGES = 5
const ELEVENLABS_VOICES_CACHE_TTL_MS = 5 * 60_000

// Keyed by a hash of the API key, never the key itself, so different accounts
// don't see each other's voices and the key never sits in a map key.
const elevenLabsVoicesCache = new Map<
  string,
  { expiresAt: number; voices: ElevenLabsVoice[] }
>()

/** Subset of Azure's `GET /cognitiveservices/voices/list` entries the UI needs.
 *  Azure voice names embed their locale (`es-UY-ValentinaNeural`), so unlike
 *  OpenAI/Gemini these are only usable for the locale they belong to. */
const AzureVoice = z.object({
  ShortName: z.string(),
  DisplayName: z.string().optional(),
  LocalName: z.string().optional(),
  Locale: z.string().optional(),
  LocaleName: z.string().optional(),
  Gender: z.string().optional(),
  VoiceType: z.string().optional(),
  StyleList: z.array(z.string()).optional(),
})

/** Flattened for the UI: `shortName` is what goes into voices.yaml. */
export interface AzureVoiceSummary {
  shortName: string
  displayName: string
  locale: string
  localeName?: string
  gender?: string
}

const AZURE_VOICES_CACHE_TTL_MS = 30 * 60_000
const azureVoicesCache = new Map<
  string,
  { expiresAt: number; voices: AzureVoiceSummary[] }
>()

/** Azure ships ~500 voices and the list changes rarely, so it is cached longer
 *  than ElevenLabs' account-scoped one. Keyed by a hash of key+region so two
 *  regions (which expose different voice sets) never share an entry. */
async function fetchAzureVoices(
  apiKey: string,
  region: string,
): Promise<AzureVoiceSummary[]> {
  const cacheKey = crypto.createHash("sha256").update(`${region}:${apiKey}`).digest("hex")
  const cached = azureVoicesCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.voices

  // Same host and key the Azure synthesizer already uses (see @adt/llm speech.ts).
  const url = `https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/voices/list`
  const response = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(
      `Azure voices request failed (${response.status}): ${message || response.statusText}`
    )
  }

  const voices = z
    .array(AzureVoice)
    .parse(await response.json())
    .map((voice) => ({
      shortName: voice.ShortName,
      displayName: voice.LocalName || voice.DisplayName || voice.ShortName,
      locale: voice.Locale ?? "",
      localeName: voice.LocaleName,
      gender: voice.Gender,
    }))
    .sort((left, right) => left.shortName.localeCompare(right.shortName))

  azureVoicesCache.set(cacheKey, {
    expiresAt: Date.now() + AZURE_VOICES_CACHE_TTL_MS,
    voices,
  })
  return voices
}

async function fetchElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const cacheKey = crypto.createHash("sha256").update(apiKey).digest("hex")
  const cached = elevenLabsVoicesCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.voices

  const voices: ElevenLabsVoice[] = []
  let pageToken: string | undefined
  for (let page = 0; page < ELEVENLABS_VOICES_MAX_PAGES; page++) {
    const url = new URL("https://api.elevenlabs.io/v2/voices")
    url.searchParams.set("page_size", String(ELEVENLABS_VOICES_PAGE_SIZE))
    url.searchParams.set("sort", "name")
    if (pageToken) url.searchParams.set("next_page_token", pageToken)

    const response = await fetch(url, { headers: { "xi-api-key": apiKey } })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(
        `ElevenLabs voices request failed (${response.status}): ${message || response.statusText}`
      )
    }
    const parsed = ElevenLabsVoicesResponse.parse(await response.json())
    voices.push(...(parsed.voices ?? []))
    if (!parsed.has_more || !parsed.next_page_token) break
    pageToken = parsed.next_page_token
  }

  elevenLabsVoicesCache.set(cacheKey, {
    expiresAt: Date.now() + ELEVENLABS_VOICES_CACHE_TTL_MS,
    voices,
  })
  return voices
}

export function createSpeechConfigRoutes(configPath: string): Hono {
  const app = new Hono()
  const configDir = path.join(path.dirname(configPath), "config")
  const StringMap = z.record(z.string(), z.string())

  app.get("/speech-config/core-tts-profiles", (c) => {
    const filePath = path.join(configDir, "core_tts_profiles.yaml")
    if (!fs.existsSync(filePath)) return c.json({})
    return c.json(
      StringMap.parse(yaml.load(fs.readFileSync(filePath, "utf-8")) ?? {}),
    )
  })

  app.put("/speech-config/core-tts-profiles", async (c) => {
    const parsed = StringMap.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: parsed.error.message }, 400)
    const filePath = path.join(configDir, "core_tts_profiles.yaml")
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(filePath, yaml.dump(parsed.data, { lineWidth: -1 }), "utf-8")
    return c.json(parsed.data)
  })

  // GET /speech-config/instructions — read speech_instructions.yaml
  app.get("/speech-config/instructions", (c) => {
    const filePath = path.join(configDir, "speech_instructions.yaml")
    if (!fs.existsSync(filePath)) {
      return c.json({})
    }
    const content = fs.readFileSync(filePath, "utf-8")
    const parsed = yaml.load(content) as Record<string, string> | null
    return c.json(parsed ?? {})
  })

  // PUT /speech-config/instructions — write speech_instructions.yaml
  app.put("/speech-config/instructions", async (c) => {
    const body = await c.req.json<Record<string, string>>()
    const filePath = path.join(configDir, "speech_instructions.yaml")
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(filePath, yaml.dump(body, { lineWidth: -1 }), "utf-8")
    return c.json(body)
  })

  // GET /speech-config/voices — read voices.yaml
  app.get("/speech-config/voices", (c) => {
    const filePath = path.join(configDir, "voices.yaml")
    if (!fs.existsSync(filePath)) {
      return c.json({})
    }
    const content = fs.readFileSync(filePath, "utf-8")
    const raw = yaml.load(content)
    const parsed = parseVoicesConfigEntries(raw ?? {})
    for (const error of parsed.errors) {
      const location = error.language
        ? `${error.provider}.${error.language}`
        : error.provider
      console.warn(`[speech-config] invalid voices.yaml entry ${location} at ${filePath}: ${error.message}`)
    }
    return c.json(parsed.data)
  })

  // PUT /speech-config/voices — write voices.yaml. Accepts both the legacy
  // scalar-string mapping and the canonical { primary, secondary } shape per
  // provider/language (see VoicesConfig / VoiceMapEntry in @adt/types).
  app.put("/speech-config/voices", async (c) => {
    const parsed = VoicesConfig.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: parsed.error.message }, 400)
    const primaryOnly = Object.fromEntries(
      Object.entries(parsed.data).map(([provider, mappings]) => [
        provider,
        Object.fromEntries(
          Object.entries(mappings).map(([language, entry]: [string, VoiceMapEntry]) => {
            const primary = normalizeVoiceMapEntry(entry).primary
            return [
              language,
              primary.label ? { primary } : primary.voice,
            ]
          }),
        ),
      ]),
    )
    const filePath = path.join(configDir, "voices.yaml")
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(filePath, yaml.dump(primaryOnly, { lineWidth: -1 }), "utf-8")
    return c.json(primaryOnly)
  })

  // GET /speech-config/elevenlabs-voices — human-readable names for the
  // opaque voice IDs stored in voices.yaml. ElevenLabs voice IDs look like
  // `21m00Tcm4TlvDq8ikWAM`, so without this the UI can only show the raw ID.
  //
  // Returns 200 with an empty list rather than an error when no key is
  // configured, so the UI degrades to a free-text input instead of showing a
  // failure for something that is optional.
  app.get("/speech-config/elevenlabs-voices", async (c) => {
    const apiKey =
      c.req.header("X-ElevenLabs-API-Key")?.trim() || process.env.ELEVENLABS_API_KEY
    if (!apiKey) return c.json({ voices: [] })

    try {
      return c.json({ voices: await fetchElevenLabsVoices(apiKey) })
    } catch (err) {
      // Never log or echo the key. The message is upstream text only.
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[speech-config] failed to list ElevenLabs voices: ${message}`)
      return c.json({ voices: [], error: message }, 502)
    }
  })

  // GET /speech-config/azure-voices — Azure's catalogue, so the UI can offer
  // real voice names instead of asking the user to guess
  // `es-UY-ValentinaNeural` from memory. Optional `?language=` filters to the
  // voices valid for that locale (Azure voices are locale-scoped, unlike
  // OpenAI's and Gemini's).
  //
  // Mirrors the ElevenLabs route: an empty list rather than an error when no
  // credentials are configured, so the UI degrades to free-text entry.
  app.get("/speech-config/azure-voices", async (c) => {
    const apiKey =
      c.req.header("X-Azure-Speech-Key")?.trim() || process.env.AZURE_SPEECH_KEY
    const region =
      c.req.header("X-Azure-Speech-Region")?.trim() || process.env.AZURE_SPEECH_REGION
    if (!apiKey || !region) return c.json({ voices: [] })

    try {
      const voices = await fetchAzureVoices(apiKey, region)
      const language = c.req.query("language")?.trim()
      if (!language) return c.json({ voices })

      // Keep every voice sharing the base language — an es-UY book can
      // sensibly narrate with any Spanish voice — but float the exact-locale
      // ones to the top. Fall back to the full list rather than handing the
      // user an empty picker for a locale Azure doesn't cover.
      const normalized = language.toLowerCase().replace("_", "-")
      const base = normalized.split("-")[0]
      const sameLanguage = voices.filter(
        (v) => v.locale.toLowerCase().split("-")[0] === base,
      )
      if (sameLanguage.length === 0) return c.json({ voices })
      const exactFirst = [
        ...sameLanguage.filter((v) => v.locale.toLowerCase() === normalized),
        ...sameLanguage.filter((v) => v.locale.toLowerCase() !== normalized),
      ]
      return c.json({ voices: exactFirst })
    } catch (err) {
      // Never log or echo the key. The message is upstream text only.
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[speech-config] failed to list Azure voices: ${message}`)
      return c.json({ voices: [], error: message }, 502)
    }
  })

  return app
}
