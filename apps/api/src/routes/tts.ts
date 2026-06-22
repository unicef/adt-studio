import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  parseBookLabel,
  TTSOutput,
  type SpeechFileEntry,
  type TTSProviderConfig,
  type TextCatalogEntry,
  type TextCatalogOutput,
  type WordTimestampEntry,
  type WordTimestampOutput,
} from "@adt/types"
import { openBookDb, createBookStorage } from "@adt/storage"
import {
  createAzureTTSSynthesizer,
  createGeminiTTSSynthesizer,
  createTTSSynthesizer,
  type LlmLogEntry,
} from "@adt/llm"
import {
  getBaseLanguage,
  loadBookConfig,
  loadSpeechInstructions,
  loadVoicesConfig,
  normalizeLocale,
  resolveInstructions,
  resolveProviderForLanguage,
  resolveSpeechFormat,
  resolveSpeechModel,
  resolveVoice,
  generateSpeechFile,
  generateWordTimestamps,
  type ProviderRouting,
} from "@adt/pipeline"

const GenerateSingleTTSBody = z
  .object({
    textId: z.string().min(1),
    language: z.string().min(1),
  })
  .strict()

const UploadSingleTTSFields = z
  .object({
    textId: z.string().min(1),
    language: z.string().min(1),
  })
  .strict()

const GEMINI_FLASH_PREVIEW_TTS_MODEL = "gemini-2.5-flash-preview-tts"
const GEMINI_PRO_PREVIEW_TTS_MODEL = "gemini-2.5-pro-preview-tts"
const SAFE_AUDIO_LANGUAGE_RE = /^[A-Za-z0-9_-]+$/
const SAFE_AUDIO_TEXT_ID_RE = /^[A-Za-z0-9._-]+$/
const AUDIO_UPLOAD_FORMAT_BY_MIME: Record<string, "mp3" | "wav" | "ogg"> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
}
const AUDIO_UPLOAD_EXTENSIONS = new Set([".mp3", ".wav", ".ogg"])

interface SingleItemFallbackAttempt {
  provider: "openai" | "azure"
  model: string
  voice: string
}

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function getBookDbPath(booksDir: string, label: string): string {
  return path.join(path.resolve(booksDir), label, `${label}.db`)
}

function getConfigDir(configPath?: string): string {
  return configPath
    ? path.join(path.dirname(configPath), "config")
    : path.resolve(process.cwd(), "config")
}

function getSourceLanguage(
  storage: ReturnType<typeof createBookStorage>,
  booksDir: string,
  label: string,
  configPath?: string
): { config: ReturnType<typeof loadBookConfig>; language: string } {
  const config = loadBookConfig(label, booksDir, configPath)
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as { language_code?: string | null } | null
  return {
    config,
    language: normalizeLocale(
      config.editing_language ?? metadata?.language_code ?? "en"
    ),
  }
}

function getOutputLanguages(
  config: ReturnType<typeof loadBookConfig>,
  sourceLanguage: string
): string[] {
  return Array.from(
    new Set(
      [sourceLanguage, ...(config.output_languages ?? [])].map((code) =>
        normalizeLocale(code)
      )
    )
  )
}

function getCatalogEntriesForLanguage(
  storage: ReturnType<typeof createBookStorage>,
  sourceLanguage: string,
  language: string
): TextCatalogEntry[] {
  const normalizedLanguage = normalizeLocale(language)
  const baseSource = getBaseLanguage(sourceLanguage)
  const baseLanguage = getBaseLanguage(normalizedLanguage)

  if (baseLanguage === baseSource) {
    const catalogRow = storage.getLatestNodeData("text-catalog", "book")
    if (!catalogRow) {
      throw new HTTPException(404, { message: "Text catalog not found" })
    }
    return (catalogRow.data as TextCatalogOutput).entries
  }

  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const translatedRow =
    storage.getLatestNodeData("text-catalog-translation", normalizedLanguage) ??
    storage.getLatestNodeData("text-catalog-translation", legacyLanguage)

  if (!translatedRow) {
    throw new HTTPException(404, {
      message: `Translated text catalog not found for ${normalizedLanguage}`,
    })
  }

  return (translatedRow.data as TextCatalogOutput).entries
}

function getLatestTtsEntries(
  storage: ReturnType<typeof createBookStorage>,
  language: string
): SpeechFileEntry[] {
  const normalizedLanguage = normalizeLocale(language)
  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const row =
    storage.getLatestNodeData("tts", normalizedLanguage) ??
    storage.getLatestNodeData("tts", legacyLanguage)

  return row ? (row.data as { entries?: SpeechFileEntry[] }).entries ?? [] : []
}

function mergeSpeechEntry(
  existingEntries: SpeechFileEntry[],
  nextEntry: SpeechFileEntry,
  orderedIds: string[]
): SpeechFileEntry[] {
  const byId = new Map(existingEntries.map((entry) => [entry.textId, entry]))
  byId.set(nextEntry.textId, nextEntry)

  const order = new Map(orderedIds.map((id, index) => [id, index]))
  return [...byId.values()].sort(
    (left, right) =>
      (order.get(left.textId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.textId) ?? Number.MAX_SAFE_INTEGER)
  )
}

function getTtsCompletionSummary(
  storage: ReturnType<typeof createBookStorage>,
  config: ReturnType<typeof loadBookConfig>,
  sourceLanguage: string
): { remainingItems: number; allComplete: boolean } {
  const outputLanguages = getOutputLanguages(config, sourceLanguage)
  let remainingItems = 0

  for (const language of outputLanguages) {
    let expectedEntries: TextCatalogEntry[]
    try {
      expectedEntries = getCatalogEntriesForLanguage(
        storage,
        sourceLanguage,
        language
      )
    } catch (err) {
      if (err instanceof HTTPException) {
        remainingItems++
        continue
      }
      throw err
    }
    const availableIds = new Set(
      getLatestTtsEntries(storage, language).map((entry) => entry.textId)
    )
    for (const entry of expectedEntries) {
      if (!availableIds.has(entry.id)) {
        remainingItems++
      }
    }
  }

  return {
    remainingItems,
    allComplete: remainingItems === 0,
  }
}

function getGeminiFallbackModel(model: string): string | null {
  if (model === GEMINI_FLASH_PREVIEW_TTS_MODEL) {
    return GEMINI_PRO_PREVIEW_TTS_MODEL
  }
  if (model === GEMINI_PRO_PREVIEW_TTS_MODEL) {
    return GEMINI_FLASH_PREVIEW_TTS_MODEL
  }
  return null
}

function getSingleItemFallbackAttempts(options: {
  openaiApiKey?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
  language: string
  providerConfigs: Record<string, TTSProviderConfig>
  voiceMaps: ReturnType<typeof loadVoicesConfig>
}): SingleItemFallbackAttempt[] {
  const attempts: SingleItemFallbackAttempt[] = []

  if (options.openaiApiKey) {
    attempts.push({
      provider: "openai",
      model: resolveSpeechModel("openai", options.providerConfigs),
      voice: resolveVoice("openai", options.language, options.voiceMaps),
    })
  }

  if (options.azureSpeechKey && options.azureSpeechRegion) {
    attempts.push({
      provider: "azure",
      model: resolveSpeechModel("azure", options.providerConfigs),
      voice: resolveVoice("azure", options.language, options.voiceMaps),
    })
  }

  return attempts
}

function resolveUploadedAudioFormat(file: File): "mp3" | "wav" | "ogg" {
  const mimeType = file.type.trim().toLowerCase()
  const byMime = AUDIO_UPLOAD_FORMAT_BY_MIME[mimeType]
  if (byMime) {
    return byMime
  }

  const extension = path.extname(file.name).toLowerCase()
  if (AUDIO_UPLOAD_EXTENSIONS.has(extension)) {
    return extension.slice(1) as "mp3" | "wav" | "ogg"
  }

  throw new HTTPException(400, {
    message: `Unsupported audio type: ${file.type || file.name}. Allowed formats: mp3, wav, ogg`,
  })
}

function clearWordTimestampEntry(
  storage: ReturnType<typeof createBookStorage>,
  language: string,
  textId: string
): void {
  const normalizedLanguage = normalizeLocale(language)
  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const row =
    storage.getLatestNodeData("tts-timestamps", normalizedLanguage) ??
    storage.getLatestNodeData("tts-timestamps", legacyLanguage)

  if (!row) return

  const existing = (row.data as WordTimestampOutput).entries
  if (!(textId in existing)) return

  const nextEntries = { ...existing }
  delete nextEntries[textId]

  storage.putNodeData("tts-timestamps", normalizedLanguage, {
    entries: nextEntries,
    generatedAt: new Date().toISOString(),
  } satisfies WordTimestampOutput)
}

function appendSingleTtsLog(
  storage: ReturnType<typeof createBookStorage>,
  options: {
    textId: string
    language: string
    voice: string
    model: string
    provider: string
    text: string
    durationMs: number
    success: boolean
    cached: boolean
    error?: string
  }
): void {
  const logEntry: LlmLogEntry = {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    taskType: "tts",
    pageId: options.textId,
    promptName: `tts-${options.provider}`,
    modelId: `${options.provider}/${options.model}`,
    cacheHit: options.cached,
    success: options.success,
    errorCount: options.success ? 0 : 1,
    attempt: 1,
    durationMs: options.durationMs,
    messages: [{
      role: "user",
      content: [{
        type: "text" as const,
        text: `[${options.language}] voice=${options.voice}\n${options.error ? `ERROR: ${options.error}\n\n` : ""}${options.text.slice(0, 300)}`,
      }],
    }],
  }

  storage.appendLlmLog(logEntry)
}

export function createTTSRoutes(booksDir: string, configPath?: string, taskService?: import("../services/task-service.js").TaskService): Hono {
  const app = new Hono()

  // GET /books/:label/tts — Get all TTS data grouped by language
  app.get("/books/:label/tts", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const db = openBookDb(dbPath)
    try {
      // TTS is stored per language: node="tts", item_id=language code
      // Get latest version per language
      const rows = db.all(
        `SELECT item_id, data, version FROM node_data
         WHERE node = ? AND (item_id, version) IN (
           SELECT item_id, MAX(version) FROM node_data WHERE node = ? GROUP BY item_id
         )`,
        ["tts", "tts"]
      ) as Array<{ item_id: string; data: string; version: number }>

      const languages: Record<string, { entries: Array<{ textId: string; fileName: string; voice: string; model: string; cached: boolean; provider?: string; cacheKey?: string }>; generatedAt: string; version: number }> = {}
      const resolvedBooksDir = path.resolve(booksDir)
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.data)
          const validated = TTSOutput.safeParse(parsed)
          if (!validated.success) continue
          const audioDir = path.join(resolvedBooksDir, safeLabel, "audio", row.item_id)
          languages[row.item_id] = {
            entries: validated.data.entries.map((e) => {
              let cacheKey: string | undefined
              try {
                cacheKey = fs.statSync(path.join(audioDir, e.fileName)).mtimeMs.toString(36)
              } catch {
                // file missing — leave cacheKey undefined
              }
              return {
                textId: e.textId,
                fileName: e.fileName,
                voice: e.voice,
                model: e.model,
                cached: e.cached,
                provider: e.provider,
                cacheKey,
              }
            }),
            generatedAt: validated.data.generatedAt,
            version: row.version,
          }
        } catch {
          // skip corrupted
        }
      }

      return c.json({ languages })
    } finally {
      db.close()
    }
  })

  // DELETE /books/:label/tts — Clear all TTS data and audio files
  app.delete("/books/:label/tts", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      storage.clearNodesByType(["tts", "tts-timestamps"])
      storage.clearStepRuns(["tts"])

      // Remove audio files on disk
      const bookDir = path.join(path.resolve(booksDir), safeLabel)
      const audioDir = path.join(bookDir, "audio")
      if (fs.existsSync(audioDir)) {
        fs.rmSync(audioDir, { recursive: true, force: true })
      }

      return c.json({ ok: true })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/tts/upload-one — Upload a manual audio file for a single text entry
  app.post("/books/:label/tts/upload-one", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const formData = await c.req.formData()
    const audioFile = formData.get("audio")
    const textId = formData.get("textId")
    const language = formData.get("language")

    if (!(audioFile instanceof File)) {
      throw new HTTPException(400, { message: "Audio file is required" })
    }

    const parsed = UploadSingleTTSFields.safeParse({
      textId: typeof textId === "string" ? textId : undefined,
      language: typeof language === "string" ? language : undefined,
    })
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid upload request: ${parsed.error.message}`,
      })
    }

    const normalizedLanguage = normalizeLocale(parsed.data.language)
    if (!SAFE_AUDIO_LANGUAGE_RE.test(normalizedLanguage)) {
      throw new HTTPException(400, {
        message: `Invalid language: ${normalizedLanguage}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)

    try {
      const { config, language: sourceLanguage } = getSourceLanguage(
        storage,
        booksDir,
        safeLabel,
        configPath
      )
      const languageEntries = getCatalogEntriesForLanguage(
        storage,
        sourceLanguage,
        normalizedLanguage
      )
      const textEntry = languageEntries.find(
        (entry) => entry.id === parsed.data.textId
      )
      if (!textEntry) {
        throw new HTTPException(404, {
          message: `Text entry not found for ${parsed.data.textId} (${normalizedLanguage})`,
        })
      }
      if (!SAFE_AUDIO_TEXT_ID_RE.test(textEntry.id)) {
        throw new HTTPException(400, {
          message: `Unsupported text ID for audio upload: ${textEntry.id}`,
        })
      }

      const format = resolveUploadedAudioFormat(audioFile)
      const nextEntry: SpeechFileEntry = {
        textId: textEntry.id,
        language: normalizedLanguage,
        fileName: `${textEntry.id}.${format}`,
        voice: "uploaded",
        model: "uploaded",
        cached: false,
        provider: "manual",
      }

      const buffer = Buffer.from(await audioFile.arrayBuffer())
      if (buffer.length === 0) {
        throw new HTTPException(400, {
          message: "Uploaded audio file is empty",
        })
      }

      const bookDir = path.join(path.resolve(booksDir), safeLabel)
      const audioRoot = path.resolve(bookDir, "audio")
      const audioDir = path.resolve(audioRoot, normalizedLanguage)
      if (
        audioDir !== audioRoot &&
        !audioDir.startsWith(audioRoot + path.sep)
      ) {
        throw new HTTPException(400, { message: "Invalid audio directory" })
      }

      const outputPath = path.resolve(audioDir, nextEntry.fileName)
      if (!outputPath.startsWith(audioDir + path.sep)) {
        throw new HTTPException(400, { message: "Invalid audio file path" })
      }

      const existingEntries = getLatestTtsEntries(storage, normalizedLanguage)
      const existingEntry = existingEntries.find(
        (entry) => entry.textId === textEntry.id
      )

      fs.mkdirSync(audioDir, { recursive: true })
      fs.writeFileSync(outputPath, buffer)

      if (
        existingEntry &&
        existingEntry.fileName !== nextEntry.fileName
      ) {
        const previousPath = path.resolve(audioDir, existingEntry.fileName)
        if (
          previousPath.startsWith(audioDir + path.sep) &&
          fs.existsSync(previousPath)
        ) {
          fs.rmSync(previousPath, { force: true })
        }
      }

      const mergedEntries = mergeSpeechEntry(
        existingEntries,
        nextEntry,
        languageEntries.map((entry) => entry.id)
      )

      const version = storage.putNodeData("tts", normalizedLanguage, {
        entries: mergedEntries,
        generatedAt: new Date().toISOString(),
      })

      clearWordTimestampEntry(storage, normalizedLanguage, textEntry.id)

      const completion = getTtsCompletionSummary(
        storage,
        config,
        sourceLanguage
      )
      if (completion.allComplete) {
        storage.markStepCompleted("tts")
      } else {
        const currentStatus = storage
          .getStepRuns()
          .find((step) => step.step === "tts")?.status
        if (currentStatus === "error") {
          storage.recordStepError(
            "tts",
            `${completion.remainingItems} audio item(s) still need generation or upload.`
          )
        }
      }

      let cacheKey: string | undefined
      try {
        cacheKey = fs.statSync(outputPath).mtimeMs.toString(36)
      } catch {
        // ignore — file was just written, this shouldn't happen
      }

      return c.json(
        {
          entry: { ...nextEntry, cacheKey },
          version,
          completed: completion.allComplete,
          remainingItems: completion.remainingItems,
        },
        201
      )
    } finally {
      storage.close()
    }
  })

  app.post("/books/:label/tts/generate-one", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const parsed = GenerateSingleTTSBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid TTS item request: ${parsed.error.message}`,
      })
    }

    const geminiApiKey = c.req.header("X-Gemini-API-Key")?.trim()
    const openaiApiKey = c.req.header("X-OpenAI-Key")?.trim()
    const azureSpeechKey = c.req.header("X-Azure-Speech-Key")?.trim()
    const azureSpeechRegion = c.req.header("X-Azure-Speech-Region")?.trim()
    if (!geminiApiKey) {
      throw new HTTPException(400, {
        message: "Gemini API key required. Set X-Gemini-API-Key header.",
      })
    }

    const normalizedLanguage = normalizeLocale(parsed.data.language)
    const storage = createBookStorage(safeLabel, booksDir)

    try {
      const { config, language: sourceLanguage } = getSourceLanguage(
        storage,
        booksDir,
        safeLabel,
        configPath
      )
      const outputLanguages = getOutputLanguages(config, sourceLanguage)
      if (!outputLanguages.includes(normalizedLanguage)) {
        throw new HTTPException(400, {
          message: `Language is not configured for TTS output: ${normalizedLanguage}`,
        })
      }

      const providerConfigs: Record<string, TTSProviderConfig> =
        config.speech?.providers ?? {}
      const routing: ProviderRouting = {
        providers: providerConfigs,
        defaultProvider: config.speech?.default_provider ?? "openai",
      }
      const provider = resolveProviderForLanguage(normalizedLanguage, routing)
      if (provider !== "gemini") {
        throw new HTTPException(400, {
          message:
            "Single-item audio generation is only available when Gemini is selected for that language.",
        })
      }

      const languageEntries = getCatalogEntriesForLanguage(
        storage,
        sourceLanguage,
        normalizedLanguage
      )
      const textEntry = languageEntries.find(
        (entry) => entry.id === parsed.data.textId
      )
      if (!textEntry) {
        throw new HTTPException(404, {
          message: `Text entry not found for ${parsed.data.textId} (${normalizedLanguage})`,
        })
      }

      const configDir = getConfigDir(configPath)
      const voiceMaps = loadVoicesConfig(configDir)
      const instructionsMap = loadSpeechInstructions(configDir)
      const model = resolveSpeechModel(provider, providerConfigs, config.speech?.model)
      const format = resolveSpeechFormat(provider, config.speech?.format)
      const voice = resolveVoice(
        provider,
        normalizedLanguage,
        voiceMaps,
        config.speech?.voice
      )
      const fallbackAttempts = getSingleItemFallbackAttempts({
        openaiApiKey,
        azureSpeechKey,
        azureSpeechRegion,
        language: normalizedLanguage,
        providerConfigs,
        voiceMaps,
      })
      const bookDir = path.join(path.resolve(booksDir), safeLabel)
      const cacheDir = path.join(bookDir, ".cache")

      const startMs = Date.now()
      const generateEntry = async (options: {
        targetProvider: string
        targetModel: string
        targetVoice: string
      }) =>
        generateSpeechFile({
          textId: textEntry.id,
          text: textEntry.text,
          language: normalizedLanguage,
          model: options.targetModel,
          voice: options.targetVoice,
          // Gemini embeds these in the prompt text; OpenAI uses its instructions
          // field. Azure has no instruction channel. Mirrors stage-runner.ts so the
          // single-item cache key matches the batch path.
          instructions:
            options.targetProvider === "openai" ||
            options.targetProvider === "gemini"
              ? resolveInstructions(normalizedLanguage, instructionsMap)
              : "",
          format,
          bookDir,
          cacheDir,
          ttsSynthesizer:
            options.targetProvider === "gemini"
              ? createGeminiTTSSynthesizer({ apiKey: geminiApiKey })
              : options.targetProvider === "azure"
                ? createAzureTTSSynthesizer({
                    subscriptionKey: azureSpeechKey!,
                    region: azureSpeechRegion!,
                  })
                : createTTSSynthesizer(openaiApiKey),
          provider: options.targetProvider,
        })

      try {
        let usedProvider = provider
        let usedModel = model
        let usedVoice = voice
        let entry: Awaited<ReturnType<typeof generateEntry>>

        try {
          entry = await generateEntry({
            targetProvider: provider,
            targetModel: model,
            targetVoice: voice,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const fallbackModel = getGeminiFallbackModel(model)
          if (
            fallbackModel &&
            /did not include audio data/i.test(message)
          ) {
            console.warn(
              `[tts] ${safeLabel}: retrying ${textEntry.id} with fallback Gemini model ${fallbackModel} after ${model} returned no audio`
            )
            usedModel = fallbackModel
            entry = await generateEntry({
              targetProvider: provider,
              targetModel: fallbackModel,
              targetVoice: voice,
            })
          } else {
            throw err
          }
        }

        if (!entry) {
          throw new HTTPException(422, {
            message: `Text entry is not speakable: ${textEntry.id}`,
          })
        }

        appendSingleTtsLog(storage, {
          textId: textEntry.id,
          language: normalizedLanguage,
          voice: usedVoice,
          model: usedModel,
          provider: usedProvider,
          text: textEntry.text,
          durationMs: Date.now() - startMs,
          success: true,
          cached: entry.cached,
        })

        const mergedEntries = mergeSpeechEntry(
          getLatestTtsEntries(storage, normalizedLanguage),
          entry,
          languageEntries.map((item) => item.id)
        )

        const version = storage.putNodeData("tts", normalizedLanguage, {
          entries: mergedEntries,
          generatedAt: new Date().toISOString(),
        })

        const completion = getTtsCompletionSummary(
          storage,
          config,
          sourceLanguage
        )
        if (completion.allComplete) {
          storage.markStepCompleted("tts")
        } else {
          const currentStatus = storage
            .getStepRuns()
            .find((step) => step.step === "tts")?.status
          if (currentStatus === "error") {
            storage.recordStepError(
              "tts",
              `${completion.remainingItems} Gemini audio item(s) still need generation.`
            )
          }
        }

        return c.json({
          entry,
          version,
          completed: completion.allComplete,
          remainingItems: completion.remainingItems,
        })
      } catch (err) {
        if (err instanceof HTTPException) {
          throw err
        }

        const message = err instanceof Error ? err.message : String(err)
        let fallbackFailureMessage = message

        if (/did not include audio data/i.test(message)) {
          for (const attempt of fallbackAttempts) {
            try {
              console.warn(
                `[tts] ${safeLabel}: retrying ${textEntry.id} with fallback provider ${attempt.provider} after Gemini returned no audio`
              )
              const entry = await generateEntry({
                targetProvider: attempt.provider,
                targetModel: attempt.model,
                targetVoice: attempt.voice,
              })

              if (!entry) {
                throw new HTTPException(422, {
                  message: `Text entry is not speakable: ${textEntry.id}`,
                })
              }

              appendSingleTtsLog(storage, {
                textId: textEntry.id,
                language: normalizedLanguage,
                voice: attempt.voice,
                model: attempt.model,
                provider: attempt.provider,
                text: textEntry.text,
                durationMs: Date.now() - startMs,
                success: true,
                cached: entry.cached,
              })

              const mergedEntries = mergeSpeechEntry(
                getLatestTtsEntries(storage, normalizedLanguage),
                entry,
                languageEntries.map((item) => item.id)
              )

              const version = storage.putNodeData("tts", normalizedLanguage, {
                entries: mergedEntries,
                generatedAt: new Date().toISOString(),
              })

              const completion = getTtsCompletionSummary(
                storage,
                config,
                sourceLanguage
              )
              if (completion.allComplete) {
                storage.markStepCompleted("tts")
              } else {
                const currentStatus = storage
                  .getStepRuns()
                  .find((step) => step.step === "tts")?.status
                if (currentStatus === "error") {
                  storage.recordStepError(
                    "tts",
                    `${completion.remainingItems} Gemini audio item(s) still need generation.`
                  )
                }
              }

              return c.json({
                entry,
                version,
                completed: completion.allComplete,
                remainingItems: completion.remainingItems,
              })
            } catch (fallbackErr) {
              if (fallbackErr instanceof HTTPException) {
                throw fallbackErr
              }
              const fallbackMessage =
                fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
              fallbackFailureMessage = `${message}. Fallback ${attempt.provider} failed: ${fallbackMessage}`
            }
          }
        }

        appendSingleTtsLog(storage, {
          textId: textEntry.id,
          language: normalizedLanguage,
          voice,
          model,
          provider,
          text: textEntry.text,
          durationMs: Date.now() - startMs,
          success: false,
          cached: false,
          error: fallbackFailureMessage,
        })
        storage.recordStepError(
          "tts",
          `Gemini audio generation failed for ${textEntry.id}: ${fallbackFailureMessage}`
        )

        const status = /\(429\)|quota|rate limit/i.test(fallbackFailureMessage) ? 429 : 502
        return c.json({ error: fallbackFailureMessage }, status)
      }
    } finally {
      storage.close()
    }
  })

  // GET /books/:label/tts/timestamps/:language — Get word timestamps for a language
  app.get("/books/:label/tts/timestamps/:language", (c) => {
    const { label, language } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const normalizedLanguage = normalizeLocale(language)
      const row = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
      if (!row) {
        return c.json({ entries: {}, generatedAt: null })
      }
      const data = row.data as WordTimestampOutput
      return c.json(data)
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/tts/timestamps/:language/:textId — Save edited word timestamps
  app.put("/books/:label/tts/timestamps/:language/:textId", async (c) => {
    const { label, language, textId } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const schema = z.object({
      words: z.array(z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      })),
      duration: z.number(),
    }).strict()

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid request: ${parsed.error.message}`,
      })
    }

    const normalizedLanguage = normalizeLocale(language)
    const storage = createBookStorage(safeLabel, booksDir)

    try {
      const existingRow = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
      const existing = existingRow
        ? (existingRow.data as WordTimestampOutput).entries
        : {}

      const updatedEntry: WordTimestampEntry = {
        textId,
        language: normalizedLanguage,
        words: parsed.data.words,
        duration: parsed.data.duration,
      }

      const merged: Record<string, WordTimestampEntry> = {
        ...existing,
        [textId]: updatedEntry,
      }

      storage.putNodeData("tts-timestamps", normalizedLanguage, {
        entries: merged,
        generatedAt: new Date().toISOString(),
      } satisfies WordTimestampOutput)

      return c.json({ ok: true })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/tts/transcribe-one — Generate word timestamps for a single entry
  app.post("/books/:label/tts/transcribe-one", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const parsed = GenerateSingleTTSBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid request: ${parsed.error.message}`,
      })
    }

    const openaiApiKey = c.req.header("X-OpenAI-Key")?.trim()
    if (!openaiApiKey) {
      throw new HTTPException(400, {
        message: "OpenAI API key required for Whisper transcription. Set X-OpenAI-Key header.",
      })
    }

    const normalizedLanguage = normalizeLocale(parsed.data.language)
    const storage = createBookStorage(safeLabel, booksDir)

    try {
      // Find the audio file for this entry
      const ttsEntries = getLatestTtsEntries(storage, normalizedLanguage)
      const ttsEntry = ttsEntries.find((e) => e.textId === parsed.data.textId)
      if (!ttsEntry) {
        throw new HTTPException(404, {
          message: `No audio found for ${parsed.data.textId} in ${normalizedLanguage}`,
        })
      }

      const bookDir = path.join(path.resolve(booksDir), safeLabel)
      const audioPath = path.resolve(bookDir, "audio", normalizedLanguage, ttsEntry.fileName)
      if (!fs.existsSync(audioPath)) {
        throw new HTTPException(404, {
          message: `Audio file not found: ${ttsEntry.fileName}`,
        })
      }

      const audioBuffer = Buffer.from(fs.readFileSync(audioPath))
      const baseLanguage = getBaseLanguage(normalizedLanguage)

      // Look up the source text to use as a Whisper prompt for improved accuracy
      const { config, language: sourceLanguage } = getSourceLanguage(storage, booksDir, safeLabel, configPath)
      void config
      let textPrompt: string | undefined
      try {
        const catalogEntries = getCatalogEntriesForLanguage(storage, sourceLanguage, normalizedLanguage)
        const entry = catalogEntries.find((e) => e.id === parsed.data.textId)
        if (entry?.text) textPrompt = entry.text
      } catch {
        // Non-critical — proceed without prompt
      }

      const result = await generateWordTimestamps({
        audioBuffer,
        fileName: ttsEntry.fileName,
        apiKey: openaiApiKey,
        language: baseLanguage,
        prompt: textPrompt,
        cacheDir: path.join(bookDir, ".cache"),
      })

      const timestampEntry: WordTimestampEntry = {
        textId: parsed.data.textId,
        language: normalizedLanguage,
        words: result.words,
        duration: result.duration,
      }

      // Merge into existing timestamps for this language
      const existingRow = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
      const existing = existingRow
        ? (existingRow.data as WordTimestampOutput).entries
        : {}

      const merged: Record<string, WordTimestampEntry> = {
        ...existing,
        [parsed.data.textId]: timestampEntry,
      }

      storage.putNodeData("tts-timestamps", normalizedLanguage, {
        entries: merged,
        generatedAt: new Date().toISOString(),
      } satisfies WordTimestampOutput)

      return c.json({ entry: timestampEntry })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/tts/transcribe-all — Batch generate word timestamps for all entries in a language
  app.post("/books/:label/tts/transcribe-all", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const parsed = z.object({ language: z.string().min(1) }).strict().safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid request: ${parsed.error.message}`,
      })
    }

    const openaiApiKey = c.req.header("X-OpenAI-Key")?.trim()
    if (!openaiApiKey) {
      throw new HTTPException(400, {
        message: "OpenAI API key required for Whisper transcription. Set X-OpenAI-Key header.",
      })
    }

    const normalizedLanguage = normalizeLocale(parsed.data.language)

    // Pre-check: count how many need transcribing before submitting task
    const preStorage = createBookStorage(safeLabel, booksDir)
    let totalToTranscribe: number
    try {
      const ttsEntries = getLatestTtsEntries(preStorage, normalizedLanguage)
      if (ttsEntries.length === 0) {
        return c.json({ taskId: null, count: 0, skipped: 0 })
      }
      const existingRow = preStorage.getLatestNodeData("tts-timestamps", normalizedLanguage)
      const existing = existingRow
        ? (existingRow.data as WordTimestampOutput).entries
        : {}
      totalToTranscribe = ttsEntries.filter((e) => !existing[e.textId]).length
      if (totalToTranscribe === 0) {
        return c.json({ taskId: null, count: 0, skipped: ttsEntries.length })
      }
    } finally {
      preStorage.close()
    }

    if (!taskService) {
      throw new HTTPException(500, { message: "Task service not available" })
    }

    const { taskId } = taskService.submitTask(
      safeLabel,
      "transcribe-timestamps",
      `Transcribing ${totalToTranscribe} entries (${normalizedLanguage})`,
      async (emitProgress) => {
        const storage = createBookStorage(safeLabel, booksDir)
        try {
          const ttsEntries = getLatestTtsEntries(storage, normalizedLanguage)
          const existingRow = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
          const existing = existingRow
            ? (existingRow.data as WordTimestampOutput).entries
            : {}

          const toTranscribe = ttsEntries.filter((e) => !existing[e.textId])
          if (toTranscribe.length === 0) return { count: 0, skipped: ttsEntries.length }

          const bookDir = path.join(path.resolve(booksDir), safeLabel)
          const baseLanguage = getBaseLanguage(normalizedLanguage)

          // Load text catalog for prompts
          const { config, language: sourceLanguage } = getSourceLanguage(storage, booksDir, safeLabel, configPath)
          void config
          let textMap = new Map<string, string>()
          try {
            const catalogEntries = getCatalogEntriesForLanguage(storage, sourceLanguage, normalizedLanguage)
            textMap = new Map(catalogEntries.map((e) => [e.id, e.text]))
          } catch {
            // Non-critical
          }

          let count = 0

          for (const ttsEntry of toTranscribe) {
            const audioPath = path.resolve(bookDir, "audio", normalizedLanguage, ttsEntry.fileName)
            if (!fs.existsSync(audioPath)) continue

            const audioBuffer = Buffer.from(fs.readFileSync(audioPath))
            const textPrompt = textMap.get(ttsEntry.textId)
            const result = await generateWordTimestamps({
              audioBuffer,
              fileName: ttsEntry.fileName,
              apiKey: openaiApiKey,
              language: baseLanguage,
              prompt: textPrompt,
              cacheDir: path.join(bookDir, ".cache"),
            })

            const entry: WordTimestampEntry = {
              textId: ttsEntry.textId,
              language: normalizedLanguage,
              words: result.words,
              duration: result.duration,
            }

            // Write incrementally to avoid overwriting concurrent user edits
            const currentRow = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
            const current = currentRow
              ? (currentRow.data as WordTimestampOutput).entries
              : {}
            storage.putNodeData("tts-timestamps", normalizedLanguage, {
              entries: { ...current, [ttsEntry.textId]: entry },
              generatedAt: new Date().toISOString(),
            } satisfies WordTimestampOutput)

            count++
            emitProgress(`${count}/${toTranscribe.length}`, Math.round((count / toTranscribe.length) * 100))
          }

          return { count, skipped: ttsEntries.length - toTranscribe.length }
        } finally {
          storage.close()
        }
      }
    )

    return c.json({ taskId })
  })

  // GET /books/:label/audio/:language/:fileName — Serve audio file
  app.get("/books/:label/audio/:language/:fileName", (c) => {
    const { label, language, fileName } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)

    // Validate language and fileName to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(language)) {
      throw new HTTPException(400, { message: "Invalid language" })
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
      throw new HTTPException(400, { message: "Invalid file name" })
    }

    const audioPath = path.resolve(bookDir, "audio", language, fileName)
    // Verify path doesn't escape book directory
    if (!audioPath.startsWith(bookDir + path.sep)) {
      throw new HTTPException(400, { message: "Invalid audio path" })
    }

    let stat: fs.Stats
    try {
      stat = fs.statSync(audioPath)
    } catch {
      throw new HTTPException(404, {
        message: `Audio file not found: ${fileName}`,
      })
    }
    if (!stat.isFile()) {
      throw new HTTPException(404, {
        message: `Audio file not found: ${fileName}`,
      })
    }

    const audioBuffer = fs.readFileSync(audioPath)
    const ext = path.extname(fileName).toLowerCase()
    const contentType =
      ext === ".mp3" ? "audio/mpeg"
        : ext === ".wav" ? "audio/wav"
          : ext === ".ogg" ? "audio/ogg"
            : "audio/mpeg"
    c.header("Content-Type", contentType)
    c.header("Cache-Control", "public, max-age=86400")
    return c.body(audioBuffer)
  })

  return app
}
