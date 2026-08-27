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
import {
  GenerateKidsVoiceRequestSchema,
  KIDS_BUDDY_IDS,
  KIDS_OPENAI_VOICES,
  KIDS_VOICE_DIR,
  KIDS_VOICE_MANIFEST_VERSION,
  KidsModeConfigSchema,
  KidsVoiceOverrideRequestSchema,
  TranslateKidsInterfaceRequestSchema,
  parseBookLabel,
  resolveKidsBuddyVoice,
  type KidsBuddyVoiceConfig,
  type KidsVoiceManifest,
} from "@adt/types"
import { createLLMModel, createPromptEngine, createTTSSynthesizer } from "@adt/llm"
import { createBookStorage } from "@adt/storage"
import {
  generateKidsVoicePack,
  getKidsInterfaceParityStatus,
  loadBookConfig,
  loadVoicesConfig,
  normalizeLocale,
  readKidsInterfaceOverrides,
  resolveKidsVoiceCacheDir,
  resolveSpeechModel,
  resolveVoice,
  translateKidsInterface,
} from "@adt/pipeline"
import {
  readKidsModeConfig,
  readKidsVoiceStatus,
  readKidsVoicesConfig,
  writeKidsModeConfig,
  writeKidsVoicesConfig,
} from "../services/kids-mode-service.js"

/**
 * Style instructions for the neutral narrator track — plain, warm reading of
 * onboarding UI copy in the book's own narration voice, with no character
 * persona (unlike the buddy voice presets in `@adt/types/kids`).
 */
const KIDS_NARRATOR_INSTRUCTIONS =
  "Read this children's book app text clearly, warmly and naturally at a " +
  "gentle pace for a young child. You are a neutral, friendly narrator — " +
  "no character voice or accent."

/** Mirrors `apps/api/src/routes/tts.ts`'s `getConfigDir` — same resolution rule. */
function getConfigDir(configPath?: string): string {
  return configPath
    ? path.join(path.dirname(configPath), "config")
    : path.resolve(process.cwd(), "config")
}

/**
 * The book narration voice per requested language — same resolution the TTS
 * pipeline uses for read-aloud speech (`config.speech.voice` default,
 * overridden per-language by `config/voices.yaml`).
 */
function resolveBookNarrationVoices(
  languages: string[],
  config: ReturnType<typeof loadBookConfig>,
  configPath?: string,
): Record<string, string> {
  const voiceMaps = loadVoicesConfig(getConfigDir(configPath))
  const result: Record<string, string> = {}
  for (const language of languages) {
    result[language] = resolveVoice(
      "openai",
      language,
      voiceMaps,
      config.speech?.voice,
    )
  }
  return result
}

/**
 * Author-time kids mode decision, stored as a flat file in the book dir
 * (book-level storage). Preview and export read it to stamp
 * `features.kidsMode` / `features.kidsBuddies` into the packaged config —
 * the reader never toggles kids mode.
 */
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
  bookDir: string,
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
    let shared: Record<string, string> = {}
    if (fs.existsSync(file)) {
      try {
        shared = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
          string,
          string
        >
      } catch {
        shared = {}
      }
    }
    // Merge the book's translated kids UI strings so buddy/narrator clips bake
    // from the localized text rather than the English fallback.
    result[lang] = { ...shared, ...readKidsInterfaceOverrides(bookDir, lang) }
  }
  return result
}

function resolveCharacters(requested: string[] | undefined): string[] {
  const pool = requested ?? [...KIDS_BUDDY_IDS]
  const known = Array.from(
    new Set(
      pool.filter((id) =>
        (KIDS_BUDDY_IDS as readonly string[]).includes(id),
      ),
    ),
  )
  if (known.length === 0) {
    throw new HTTPException(400, {
      message: `No valid buddy characters requested (known: ${KIDS_BUDDY_IDS.join(", ")})`,
    })
  }
  return known
}

/** Mark one buddy's baked clips stale after its voice configuration changes. */
function invalidateKidsVoiceCharacter(bookDir: string, buddyId: string): void {
  const root = path.join(bookDir, KIDS_VOICE_DIR)
  if (!fs.existsSync(root)) return
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const languageDir = path.join(root, entry.name)
    const manifestPath = path.join(languageDir, "manifest.json")
    try {
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(
          fs.readFileSync(manifestPath, "utf8"),
        ) as KidsVoiceManifest
        if (manifest.characters?.[buddyId]) {
          delete manifest.characters[buddyId]
          fs.writeFileSync(
            manifestPath,
            `${JSON.stringify(manifest, null, 2)}\n`,
          )
        }
      }
      fs.rmSync(path.join(languageDir, buddyId), {
        recursive: true,
        force: true,
      })
    } catch {
      // A malformed old pack is already unusable. Generation will replace it.
    }
  }
}

/** Translated line text changes every clip in that language. */
function invalidateKidsVoiceLanguages(
  bookDir: string,
  languages: readonly string[],
): void {
  const root = path.resolve(bookDir, KIDS_VOICE_DIR)
  for (const language of languages) {
    const languageDir = path.resolve(root, language)
    if (!languageDir.startsWith(root + path.sep)) continue
    fs.rmSync(languageDir, { recursive: true, force: true })
  }
}

export function createKidsVoiceRoutes(
  booksDir: string,
  webAssetsDir: string,
  promptsDir: string,
  configPath?: string,
): Hono {
  const app = new Hono()

  function getInterfaceStatus(safeLabel: string, bookDir: string) {
    return getKidsInterfaceParityStatus({
      bookDir,
      webAssetsDir,
      languages: getBookLanguages(safeLabel, booksDir, configPath),
    })
  }

  // Translate the kids UI into the given languages, storing per-book overrides.
  // Shared by the explicit "Translate interface" endpoint (force = true) and
  // the voice generator (force = false — only fills untranslated languages so
  // clips never bake from English text).
  async function runKidsInterfaceTranslation(options: {
    safeLabel: string
    bookDir: string
    config: ReturnType<typeof loadBookConfig>
    targetLanguages: string[]
    openaiApiKey: string
    force: boolean
  }): Promise<{ languages: string[]; keyCount: number }> {
    const storage = createBookStorage(options.safeLabel, booksDir)
    try {
      const bookPromptsDir = path.join(options.bookDir, "prompts")
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
      const llmModel = createLLMModel({
        modelId:
          options.config.translation?.model ??
          options.config.page_sectioning?.model ??
          "openai:gpt-4.1",
        cacheDir: path.join(options.bookDir, ".cache"),
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
        credentials: { openaiApiKey: options.openaiApiKey },
      })
      return await translateKidsInterface({
        bookDir: options.bookDir,
        webAssetsDir,
        targetLanguages: options.targetLanguages,
        appConfig: options.config,
        llmModel,
        force: options.force,
      })
    } finally {
      storage.close()
    }
  }

  app.get("/books/:label/kids-mode", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)
    return c.json(readKidsModeConfig(bookDir))
  })

  app.get("/books/:label/kids-interface/status", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)
    return c.json(getInterfaceStatus(safeLabel, bookDir))
  })

  app.put("/books/:label/kids-mode", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }
    const parsed = KidsModeConfigSchema.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid kids mode config: ${parsed.error.message}`,
      })
    }

    if (parsed.data.enabled) {
      const status = getInterfaceStatus(safeLabel, bookDir)
      if (!status.ready) {
        const missing = status.languages
          .filter((language) => !language.ready)
          .map(
            (language) =>
              `${language.language} (${language.missingKeys.length} missing)`,
          )
        const detail =
          status.sourceKeyCount === 0
            ? "the English Kids UI source catalog is unavailable"
            : missing.length > 0
              ? missing.join(", ")
              : "the book has no configured languages"
        throw new HTTPException(409, {
          message: `Translate the Kids UI for every book language before enabling Kids Mode: ${detail}`,
        })
      }
    }

    writeKidsModeConfig(bookDir, parsed.data)
    return c.json(parsed.data)
  })

  app.get("/books/:label/kids-voices", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)
    const { overrides } = readKidsVoicesConfig(bookDir)

    const buddies = KIDS_BUDDY_IDS.map((id) => {
      const resolved = resolveKidsBuddyVoice(id, overrides)
      return {
        id,
        voice: resolved.voice,
        instructions: resolved.instructions,
        isDefault: !overrides[id],
      }
    })

    // The buddy dropdown shouldn't offer the book's own narration voice —
    // picking it would make a buddy sound like the narrator. If every voice
    // would be excluded (e.g. narration uses every offered voice across
    // languages), fall back to the full list rather than leaving nothing to
    // pick.
    const config = loadBookConfig(safeLabel, booksDir, configPath)
    const bookLanguages = getBookLanguages(safeLabel, booksDir, configPath)
    const narrationVoices = new Set(
      Object.values(
        resolveBookNarrationVoices(bookLanguages, config, configPath),
      ),
    )
    const filteredVoices = KIDS_OPENAI_VOICES.filter(
      (voice) => !narrationVoices.has(voice),
    )
    const voices =
      filteredVoices.length > 0 ? filteredVoices : KIDS_OPENAI_VOICES

    return c.json({ buddies, voices })
  })

  app.put("/books/:label/kids-voices/:buddyId", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)
    const buddyId = c.req.param("buddyId")
    if (!(KIDS_BUDDY_IDS as readonly string[]).includes(buddyId)) {
      throw new HTTPException(404, { message: `Unknown buddy: ${buddyId}` })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }
    const parsed = KidsVoiceOverrideRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid voice override: ${parsed.error.message}`,
      })
    }

    const config = readKidsVoicesConfig(bookDir)
    config.overrides[buddyId] = {
      voice: parsed.data.voice,
      instructions: parsed.data.instructions,
    }
    writeKidsVoicesConfig(bookDir, config)
    invalidateKidsVoiceCharacter(bookDir, buddyId)

    return c.json({
      id: buddyId,
      voice: parsed.data.voice,
      instructions: parsed.data.instructions,
      isDefault: false,
    })
  })

  app.delete("/books/:label/kids-voices/:buddyId", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)
    const buddyId = c.req.param("buddyId")
    if (!(KIDS_BUDDY_IDS as readonly string[]).includes(buddyId)) {
      throw new HTTPException(404, { message: `Unknown buddy: ${buddyId}` })
    }

    const config = readKidsVoicesConfig(bookDir)
    if (buddyId in config.overrides) {
      delete config.overrides[buddyId]
      writeKidsVoicesConfig(bookDir, config)
      invalidateKidsVoiceCharacter(bookDir, buddyId)
    }

    const fallback = resolveKidsBuddyVoice(buddyId)
    return c.json({
      id: buddyId,
      voice: fallback.voice,
      instructions: fallback.instructions,
      isDefault: true,
    })
  })

  app.get("/books/:label/kids-voice", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)
    const languages = getBookLanguages(safeLabel, booksDir, configPath)
    return c.json(readKidsVoiceStatus(bookDir, languages))
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
    const parsed = GenerateKidsVoiceRequestSchema.safeParse(body)
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
    const languages = Array.from(
      new Set(
        (
          parsed.data.languages?.map((code) => normalizeLocale(code)) ??
          bookLanguages
        ).filter((code) => bookLanguages.includes(code)),
      ),
    )
    if (languages.length === 0) {
      throw new HTTPException(400, {
        message: `No requested language is configured for this book (configured: ${bookLanguages.join(", ")})`,
      })
    }

    const characters = resolveCharacters(
      parsed.data.characters ?? readKidsModeConfig(bookDir).buddies,
    )

    const model = resolveSpeechModel(
      "openai",
      config.speech?.providers ?? {},
      config.speech?.model,
    )

    // Refresh the narrator track (book narration voice, neutral direction)
    // for every affected language alongside every generate run — per-buddy
    // or global — so it never goes stale relative to the book's own voice.
    const narratorVoiceByLanguage: Record<
      string,
      { voice: string; instructions: string }
    > = {}
    for (const [language, voice] of Object.entries(
      resolveBookNarrationVoices(languages, config, configPath),
    )) {
      narratorVoiceByLanguage[language] = {
        voice,
        instructions: KIDS_NARRATOR_INSTRUCTIONS,
      }
    }

    try {
      // Ensure the kids UI is translated for the target languages first, so
      // buddy/narrator clips bake from the localized text instead of English.
      // Skips already-complete languages (no redundant LLM calls).
      if (!dryRun && openaiApiKey) {
        await runKidsInterfaceTranslation({
          safeLabel,
          bookDir,
          config,
          targetLanguages: languages,
          openaiApiKey,
          force: false,
        })
      }

      const result = await generateKidsVoicePack({
        bookDir,
        narratorVoiceByLanguage,
        // Clips are book-independent — cache globally so the second book's
        // generation is a pure cache hit. The per-book .cache is kept as a
        // read-through fallback so packs generated before this change
        // migrate without re-paying the API.
        cacheDir: resolveKidsVoiceCacheDir(booksDir),
        fallbackCacheDirs: [path.join(bookDir, ".cache")],
        languages,
        characters,
        translationsByLanguage: loadInterfaceTranslations(
          webAssetsDir,
          bookDir,
          languages,
        ),
        voiceOverrides: readKidsVoicesConfig(bookDir).overrides,
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

  // Translate the kids UI strings into the book's output languages so the
  // onboarding + buddy menu are localized and voice packs bake from the
  // translated text (run this before generating voices for a new language).
  app.post("/books/:label/kids-interface/translate", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const bookDir = getBookDir(booksDir, safeLabel)

    const openaiApiKey = c.req.header("X-OpenAI-Key")?.trim()
    if (!openaiApiKey) {
      throw new HTTPException(400, {
        message: "OpenAI API key required. Set X-OpenAI-Key header.",
      })
    }

    let body: unknown = {}
    const raw = await c.req.text()
    if (raw.trim().length > 0) {
      try {
        body = JSON.parse(raw)
      } catch {
        throw new HTTPException(400, { message: "Invalid JSON body" })
      }
    }
    const parsed = TranslateKidsInterfaceRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid translate request: ${parsed.error.message}`,
      })
    }

    const config = loadBookConfig(safeLabel, booksDir, configPath)
    const bookLanguages = getBookLanguages(safeLabel, booksDir, configPath)
    const targetLanguages = Array.from(
      new Set(
        (
          parsed.data.languages?.map((code) => normalizeLocale(code)) ??
          bookLanguages
        ).filter((code) => bookLanguages.includes(code)),
      ),
    )

    try {
      const result = await runKidsInterfaceTranslation({
        safeLabel,
        bookDir,
        config,
        targetLanguages,
        openaiApiKey,
        force: true,
      })
      invalidateKidsVoiceLanguages(bookDir, result.languages)
      return c.json(result)
    } catch (err) {
      throw new HTTPException(502, {
        message: `Kids interface translation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    }
  })

  return app
}
