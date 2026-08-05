import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { Hono } from "hono"
import yaml from "js-yaml"
import { z } from "zod"

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
    const parsed = yaml.load(content) as Record<string, Record<string, string>> | null
    return c.json(parsed ?? {})
  })

  // PUT /speech-config/voices — write voices.yaml
  app.put("/speech-config/voices", async (c) => {
    const body = await c.req.json<Record<string, Record<string, string>>>()
    const filePath = path.join(configDir, "voices.yaml")
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(filePath, yaml.dump(body, { lineWidth: -1 }), "utf-8")
    return c.json(body)
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

  return app
}
