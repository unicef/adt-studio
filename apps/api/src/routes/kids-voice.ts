/**
 * Kids Mode buddy voice pack routes.
 *
 * POST /books/:label/kids-voice/generate — synthesize clips for the packed
 * buddies × requested languages via OpenAI TTS (X-OpenAI-Key header), using
 * the shared per-book TTS cache. `dryRun: true` plans the work and reports
 * cache hits without calling the API or writing files (no key needed).
 *
 * GET /books/:label/kids-voice — per-language pack status for the Studio UI.
 */
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  KIDS_BUDDY_IDS,
  KIDS_VOICE_DIR,
  parseBookLabel,
  type KidsVoiceManifest,
} from "@adt/types"
import { createTTSSynthesizer } from "@adt/llm"
import {
  generateKidsVoicePack,
  loadBookConfig,
  normalizeLocale,
  resolveSpeechModel,
} from "@adt/pipeline"

const GenerateKidsVoiceBody = z
  .object({
    languages: z.array(z.string().min(1)).optional(),
    characters: z.array(z.string().min(1)).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict()

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function getBookDir(booksDir: string, label: string): string {
  const dir = path.join(path.resolve(booksDir), label)
  if (!fs.existsSync(dir)) {
    throw new HTTPException(404, { message: `Book not found: ${label}` })
  }
  return dir
}

function getBookLanguages(
  label: string,
  booksDir: string,
  configPath?: string,
): string[] {
  const config = loadBookConfig(label, booksDir, configPath)
  const source = normalizeLocale(config.editing_language ?? "en")
  return Array.from(
    new Set(
      [source, ...(config.output_languages ?? [])].map((code) =>
        normalizeLocale(code),
      ),
    ),
  )
}

function loadInterfaceTranslations(
  webAssetsDir: string,
  languages: string[],
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  for (const lang of languages) {
    const file = path.join(
      webAssetsDir,
      "interface_translations",
      lang,
      "interface_translations.json",
    )
    if (!fs.existsSync(file)) {
      result[lang] = {}
      continue
    }
    try {
      result[lang] = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
        string,
        string
      >
    } catch {
      result[lang] = {}
    }
  }
  return result
}

function resolveCharacters(requested: string[] | undefined): string[] {
  const pool = requested ?? [...KIDS_BUDDY_IDS]
  const known = pool.filter((id) =>
    (KIDS_BUDDY_IDS as readonly string[]).includes(id),
  )
  if (known.length === 0) {
    throw new HTTPException(400, {
      message: `No valid buddy characters requested (known: ${KIDS_BUDDY_IDS.join(", ")})`,
    })
  }
  return known
}

export function createKidsVoiceRoutes(
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
): Hono {
  const app = new Hono()

  app.get("/books/:label/kids-voice", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)
    const languages = getBookLanguages(safeLabel, booksDir, configPath)

    const status = languages.map((language) => {
      const manifestPath = path.join(
        bookDir,
        KIDS_VOICE_DIR,
        language,
        "manifest.json",
      )
      if (!fs.existsSync(manifestPath)) {
        return { language, hasPack: false, clipCount: 0, characters: [] }
      }
      try {
        const manifest = JSON.parse(
          fs.readFileSync(manifestPath, "utf8"),
        ) as KidsVoiceManifest
        const characters = Object.keys(manifest.characters ?? {})
        const clipCount = characters.reduce(
          (sum, id) => sum + Object.keys(manifest.characters[id] ?? {}).length,
          0,
        )
        return { language, hasPack: true, clipCount, characters }
      } catch {
        return { language, hasPack: false, clipCount: 0, characters: [] }
      }
    })

    return c.json({ languages: status })
  })

  app.post("/books/:label/kids-voice/generate", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)

    let body: unknown = {}
    const raw = await c.req.text()
    if (raw.trim().length > 0) {
      try {
        body = JSON.parse(raw)
      } catch {
        throw new HTTPException(400, { message: "Invalid JSON body" })
      }
    }
    const parsed = GenerateKidsVoiceBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid kids-voice request: ${parsed.error.message}`,
      })
    }

    const dryRun = parsed.data.dryRun ?? false
    const openaiApiKey = c.req.header("X-OpenAI-Key")?.trim()
    if (!dryRun && !openaiApiKey) {
      throw new HTTPException(400, {
        message: "OpenAI API key required. Set X-OpenAI-Key header.",
      })
    }

    const config = loadBookConfig(safeLabel, booksDir, configPath)
    const bookLanguages = getBookLanguages(safeLabel, booksDir, configPath)
    const languages = (
      parsed.data.languages?.map((code) => normalizeLocale(code)) ??
      bookLanguages
    ).filter((code) => bookLanguages.includes(code))
    if (languages.length === 0) {
      throw new HTTPException(400, {
        message: `No requested language is configured for this book (configured: ${bookLanguages.join(", ")})`,
      })
    }

    const characters = resolveCharacters(parsed.data.characters)

    const model = resolveSpeechModel(
      "openai",
      config.speech?.providers ?? {},
      config.speech?.model,
    )

    try {
      const result = await generateKidsVoicePack({
        bookDir,
        cacheDir: path.join(bookDir, ".cache"),
        languages,
        characters,
        translationsByLanguage: loadInterfaceTranslations(
          webAssetsDir,
          languages,
        ),
        ttsSynthesizer: createTTSSynthesizer(openaiApiKey),
        model,
        dryRun,
      })
      return c.json({
        languages,
        characters,
        model,
        total: result.total,
        generated: result.generated,
        cachedHits: result.cachedHits,
        dryRun: result.dryRun,
        clips: result.clips.map(({ text: _text, ...clip }) => clip),
      })
    } catch (err) {
      throw new HTTPException(502, {
        message: `Kids voice generation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    }
  })

  return app
}
