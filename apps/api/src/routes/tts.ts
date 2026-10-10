import { captureOutputReferences } from "@adt/pipeline"
import { catalogOutputs, assertEditVersion } from "../services/catalog-output-service.js"
import { assertOutputPublication, outputIdentityKey, selectedForGeneration, outputEvidence, timestampInputSignature } from "@adt/pipeline"
import { OutputReplacement, OutputRunScope } from "@adt/types"
import { publishSpeechOutput, publishSpeechTimings, readBookAsset } from "@adt/storage"
import { reconcileSpeechInputs, loadCoreTtsProfiles } from "@adt/pipeline"
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  parseBookLabel,
  TTSOutput,
  isTtsExcluded,
  voiceSlotEntryId,
  resolveEntryVoiceSlot,
  sortSpeechEntries,
  VoiceSlot,
  type SpeechFileEntry,
  type SpeechFailedEntry,
  type TTSProviderConfig,
  type TextCatalogEntry,
  type TextCatalogOutput,
  type WordTimestampEntry,
  type WordTimestampOutput,
} from "@adt/types"
import { openBookDb, createBookStorage, storeImmutableAsset, CURRENT_VERSION_ORDER } from "@adt/storage"
import {
  AiProviderError,
  createAzureTTSSynthesizer,
  createGeminiTTSSynthesizer,
  createElevenLabsTTSSynthesizer,
  createTTSSynthesizer,
  type ResolvedCredentials,
} from "@adt/llm"
import {
  getBaseLanguage,
  loadBookConfig,
  loadSpeechInstructions,
  loadVoicesConfig,
  normalizeLocale,
  overlayPrimaryVoices,
  resolveInstructions,
  resolveSpeechFormat,
  resolveSpeechModel,
  resolveSpeechVoice,
  resolveVoice,
  generateSpeechFile,
  generateWordTimestamps,
  getCoreTtsCatalog,
  getReadyCoreTtsEntries,
  findAdjacentSpeechText,
  buildTtsLogEntry,
  elevenLabsVoiceSettingsFromConfig,
  buildElevenLabsTtsLogParams,
  classifyElevenLabsTtsError,
  elevenLabsTtsRetryDelayMs,
  type VoiceMaps,
} from "@adt/pipeline"
import { getLiveSpeechRun } from "../services/speech-progress.js"
import {
  readProviderCredentials,
  serverAwareCredentialValue,
} from "../middleware/provider-credentials.js"

/**
 * Word timestamps come from Whisper, so the transcription provider is fixed
 * until the speech modality is resolved through the registry.
 */
function requireTranscriberKey(credentials: ResolvedCredentials): string {
  const apiKey = serverAwareCredentialValue(credentials, "openai", "apiKey")
  if (!apiKey) {
    throw AiProviderError.missingCredential("openai", "apiKey", "API key")
  }
  return apiKey
}

const GenerateSingleTTSBody = z
  .object({
    textId: z.string().min(1),
    language: z.string().min(1),
    voiceSlot: VoiceSlot.optional(),
    replacement: OutputReplacement.optional(),
  })
  .strict()

const UploadSingleTTSFields = z
  .object({
    textId: z.string().min(1),
    language: z.string().min(1),
    voiceSlot: VoiceSlot.optional(),
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
  provider: "openai" | "azure" | "elevenlabs"
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
  _sourceLanguage: string,
  language: string
): TextCatalogEntry[] {
  const normalizedLanguage = normalizeLocale(language)
  if (!getCoreTtsCatalog(storage, normalizedLanguage)) {
    throw new HTTPException(404, {
      message: `Core TTS catalog not found for ${normalizedLanguage}`,
    })
  }
  return getReadyCoreTtsEntries(storage, normalizedLanguage)
}

function getLatestTtsEntries(
  storage: ReturnType<typeof createBookStorage>,
  language: string
): SpeechFileEntry[] {
  return getLatestTtsOutput(storage, language)?.entries ?? []
}

function getLatestTtsOutput(
  storage: ReturnType<typeof createBookStorage>,
  language: string
): TTSOutput | undefined {
  const normalizedLanguage = normalizeLocale(language)
  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const row =
    storage.getLatestNodeData("tts", normalizedLanguage) ??
    storage.getLatestNodeData("tts", legacyLanguage)

  return row ? (row.data as TTSOutput) : undefined
}

function mergeSpeechEntry(
  existingEntries: SpeechFileEntry[],
  nextEntry: SpeechFileEntry,
  orderedIds: string[]
): SpeechFileEntry[] {
  // Keyed by the slot-qualified id so primary/secondary variants of the same
  // textId are independent entries rather than overwriting each other.
  const byId = new Map(
    existingEntries.map((entry) => [voiceSlotEntryId(entry.textId, entry.voiceSlot), entry])
  )
  byId.set(voiceSlotEntryId(nextEntry.textId, nextEntry.voiceSlot), nextEntry)

  return sortSpeechEntries([...byId.values()], orderedIds)
}

function buildUpdatedTtsOutput(
  storage: ReturnType<typeof createBookStorage>,
  language: string,
  entries: SpeechFileEntry[],
  resolvedTextId: string,
  resolvedVoiceSlot: VoiceSlot
): TTSOutput {
  const previous = getLatestTtsOutput(storage, language)
  const failed = (previous?.failed ?? []).filter(
    (entry) =>
      !(entry.textId === resolvedTextId && resolveEntryVoiceSlot(entry) === resolvedVoiceSlot)
  )
  return {
    entries,
    generatedAt: new Date().toISOString(),
    ...(failed.length > 0 ? { failed } : {}),
  }
}

function getTtsCompletionSummary(
  storage: ReturnType<typeof createBookStorage>,
  config: ReturnType<typeof loadBookConfig>,
  sourceLanguage: string,
  voiceMaps: VoiceMaps
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
    const configuredSlots: VoiceSlot[] = resolveSpeechVoice(
      language,
      "secondary",
      config.speech,
      voiceMaps,
      config.speech?.model ?? config.default_speech_generation_model,
    )
      ? ["primary", "secondary"]
      : ["primary"]
    const availableIds = new Set(
      getLatestTtsEntries(storage, language).map((entry) =>
        voiceSlotEntryId(entry.textId, entry.voiceSlot)
      )
    )
    for (const entry of expectedEntries) {
      if (isTtsExcluded(entry.id, config.speech)) continue
      for (const slot of configuredSlots) {
        if (!availableIds.has(voiceSlotEntryId(entry.id, slot))) {
          remainingItems++
        }
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

// Retries for a single-item ElevenLabs regeneration. Much lower than the batch
// paths' ELEVENLABS_TTS_MAX_RATE_LIMIT_RETRIES (5, backing off to 30s) because
// this runs inside an HTTP request: 2 retries at 2s + 4s absorb a transient
// concurrency 429 while keeping the response well inside client/proxy timeouts.
const ELEVENLABS_SINGLE_ITEM_MAX_RETRIES = 2

/**
 * The credential a given TTS provider needs for single-item regeneration, or
 * null when the request already carries it. Returns a message naming the
 * missing header so the UI can tell the user which key to add, rather than
 * failing with a generic "provider not supported".
 */
function getMissingProviderKeyMessage(
  provider: string,
  keys: {
    geminiApiKey?: string
    openaiApiKey?: string
    azureSpeechKey?: string
    azureSpeechRegion?: string
    elevenLabsApiKey?: string
  },
): string | null {
  switch (provider) {
    case "gemini":
      return keys.geminiApiKey
        ? null
        : "Gemini API key required. Set X-Gemini-API-Key header."
    case "elevenlabs":
      return keys.elevenLabsApiKey
        ? null
        : "ElevenLabs API key required. Set X-ElevenLabs-API-Key header."
    case "azure":
      return keys.azureSpeechKey && keys.azureSpeechRegion
        ? null
        : "Azure Speech key and region required. Set X-Azure-Speech-Key and X-Azure-Speech-Region headers."
    default:
      return keys.openaiApiKey
        ? null
        : "OpenAI API key required. Set X-OpenAI-Key header."
  }
}

function getSingleItemFallbackAttempts(options: {
  openaiApiKey?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
  elevenLabsApiKey?: string
  language: string
  providerConfigs: Record<string, TTSProviderConfig>
  voiceMaps: VoiceMaps
  defaultOpenAIModel?: string
  /** The provider already tried as the primary attempt — excluded so a
   *  failure isn't retried against the same provider that just failed. */
  primaryProvider?: string
}): SingleItemFallbackAttempt[] {
  const attempts: SingleItemFallbackAttempt[] = []

  if (options.openaiApiKey) {
    attempts.push({
      provider: "openai",
      model: resolveSpeechModel(
        "openai",
        options.providerConfigs,
        options.defaultOpenAIModel,
      ),
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

  if (options.elevenLabsApiKey) {
    attempts.push({
      provider: "elevenlabs",
      model: resolveSpeechModel("elevenlabs", options.providerConfigs),
      voice: resolveVoice("elevenlabs", options.language, options.voiceMaps),
    })
  }

  return attempts.filter((attempt) => attempt.provider !== options.primaryProvider)
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
  textId: string,
  voiceSlot: VoiceSlot
): void {
  const normalizedLanguage = normalizeLocale(language)
  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const row =
    storage.getLatestNodeData("tts-timestamps", normalizedLanguage) ??
    storage.getLatestNodeData("tts-timestamps", legacyLanguage)

  if (!row) return

  const data = row.data as WordTimestampOutput
  const existing = data.entries
  const failed = data.failed ?? []
  const slotEntryId = voiceSlotEntryId(textId, voiceSlot)
  const hasEntry = slotEntryId in existing
  const hasFailed = failed.some(
    (f) => f.textId === textId && resolveEntryVoiceSlot(f) === voiceSlot
  )
  if (!hasEntry && !hasFailed) return

  const nextEntries = { ...existing }
  delete nextEntries[slotEntryId]
  // Removing/replacing the audio makes any prior highlighting failure stale.
  const nextFailed = failed.filter(
    (f) => !(f.textId === textId && resolveEntryVoiceSlot(f) === voiceSlot)
  )

  publishSpeechTimings(storage, normalizedLanguage, {
    entries: nextEntries,
    generatedAt: new Date().toISOString(),
    ...(nextFailed.length > 0 ? { failed: nextFailed } : {}),
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
    attempt: number
    error?: string
    /** Resolved provider request parameters, for the debug panel. */
    params?: Record<string, unknown>
  }
): void {
  const logEntry = buildTtsLogEntry({
    ...options,
  })

  storage.appendLlmLog(logEntry)
}

export function createTTSRoutes(booksDir: string, configPath?: string, taskService?: import("../services/task-service.js").TaskService, promptsDir = path.resolve("prompts")): Hono {
  const app = new Hono()

  // GET /books/:label/tts — Get all TTS data grouped by language
  app.get("/books/:label/tts", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const resolvedBooksDir = path.resolve(booksDir)
    const mapEntries = (language: string, entries: SpeechFileEntry[]) => {
      const audioDir = path.join(resolvedBooksDir, safeLabel, "audio", language)
      const storage = createBookStorage(safeLabel, booksDir)
      let readyIds: Set<string>
      try {
        const { config, language: sourceLanguage } = getSourceLanguage(storage, booksDir, safeLabel, configPath)
        readyIds = new Set(reconcileSpeechInputs({ storage, config, sourceLanguage, languages: [language], profiles: loadCoreTtsProfiles(getConfigDir(configPath)), promptsDir, bookDir: path.join(resolvedBooksDir, safeLabel), persist: false })[0].entries.map((entry) => entry.id))
      } finally {
        storage.close()
      }
      return entries.filter((entry) => readyIds.has(entry.textId)).map((e) => {
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
          // Missing/undefined slot is a legacy (pre-dual-voice) entry —
          // resolve it to "primary" so the client never has to special-case it.
          voiceSlot: resolveEntryVoiceSlot(e),
          voiceLabel: e.voiceLabel,
          cacheKey,
        }
      })
    }

    const languages: Record<string, { entries: Array<{ textId: string; fileName: string; voice: string; model: string; cached: boolean; provider?: string; voiceSlot: VoiceSlot; voiceLabel?: string; cacheKey?: string }>; failed?: SpeechFailedEntry[]; generatedAt: string; version: number }> = {}

    // While a speech run is active, serve its live snapshot — node data is
    // only persisted at the end of the run, but audio files land on disk per
    // item, so this lets the Speech view fill in progressively.
    const live = getLiveSpeechRun(safeLabel)
    if (live) {
      for (const [lang, data] of Object.entries(live.languages)) {
        languages[lang] = {
          entries: mapEntries(lang, data.entries),
          ...(data.failed.length > 0 ? { failed: data.failed } : {}),
          generatedAt: live.startedAt,
          version: 0,
        }
      }
      return c.json({ languages, live: true })
    }

    const db = openBookDb(dbPath)
    try {
      // TTS is stored per language: node="tts", item_id=language code
      // Get latest version per language
      const rows = db.all(
        `SELECT nd.item_id AS item_id, nd.data AS data, nd.version AS version FROM node_data nd
         LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
         WHERE nd.node = ? ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`,
        ["tts"]
      ) as Array<{ item_id: string; data: string; version: number }>
      const seen = new Set<string>()
      for (const row of rows) {
        if (seen.has(row.item_id)) continue
        seen.add(row.item_id)
        try {
          const parsed = JSON.parse(row.data)
          const validated = TTSOutput.safeParse(parsed)
          if (!validated.success) continue
          languages[row.item_id] = {
            entries: mapEntries(row.item_id, validated.data.entries),
            ...(validated.data.failed && validated.data.failed.length > 0
              ? { failed: validated.data.failed }
              : {}),
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

  // DELETE /books/:label/tts — Reset active output, retaining restorable history
  app.delete("/books/:label/tts", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      storage.transaction(() => {
        for (const language of storage.getNodeItemIds("tts")) publishSpeechOutput(storage, language, { entries: [], generatedAt: new Date().toISOString() })
        storage.clearStepRuns(["tts", "word-timestamps"])
      })

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
    const voiceSlotField = formData.get("voiceSlot")

    if (!(audioFile instanceof File)) {
      throw new HTTPException(400, { message: "Audio file is required" })
    }

    const parsed = UploadSingleTTSFields.safeParse({
      textId: typeof textId === "string" ? textId : undefined,
      language: typeof language === "string" ? language : undefined,
      voiceSlot: typeof voiceSlotField === "string" ? voiceSlotField : undefined,
    })
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid upload request: ${parsed.error.message}`,
      })
    }

    const voiceSlot: VoiceSlot = parsed.data.voiceSlot ?? "primary"

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
      reconcileSpeechInputs({ storage, config, sourceLanguage, languages: [normalizedLanguage], profiles: loadCoreTtsProfiles(getConfigDir(configPath)), promptsDir, bookDir: path.join(path.resolve(booksDir), safeLabel) })
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

      const configDir = getConfigDir(configPath)
      const voiceMaps = loadVoicesConfig(configDir)
      const profile = resolveSpeechVoice(
        normalizedLanguage,
        voiceSlot,
        config.speech,
        voiceMaps,
        config.speech?.model ?? config.default_speech_generation_model,
      )
      if (!profile) {
        throw new HTTPException(400, {
          message: `Secondary voice is not configured for ${normalizedLanguage}`,
        })
      }
      const voiceLabel = profile.label

      let requestedBaseline: unknown
      try { requestedBaseline = JSON.parse(String(formData.get("baseline") ?? "null")) } catch { /* Validated below. */ }
      const baseline = OutputReplacement.safeParse(requestedBaseline)
      const identity = { kind: "audio" as const, id: textEntry.id, language: normalizedLanguage, voiceSlot }
      const before = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath)
      const status = before.find((item) => outputIdentityKey(item.identity) === outputIdentityKey(identity))
      if (!baseline.success || outputIdentityKey(baseline.data.identity) !== outputIdentityKey(identity) || !status || status.signature !== baseline.data.signature || status.contentHash !== baseline.data.contentHash) {
        throw new HTTPException(409, { message: "Audio or its inputs changed. Refresh before uploading your recording." })
      }
      const format = resolveUploadedAudioFormat(audioFile)
      const nextEntry: SpeechFileEntry = {
        textId: textEntry.id,
        language: normalizedLanguage,
        fileName: `${voiceSlotEntryId(textEntry.id, voiceSlot)}.${format}`,
        voice: "uploaded",
        model: "uploaded",
        cached: false,
        provider: "manual",
        source: "manual",
        voiceSlot,
        ...(voiceLabel ? { voiceLabel } : {}),
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

      const existingEntries = getLatestTtsEntries(storage, normalizedLanguage)
      const asset = storeImmutableAsset(bookDir, ["audio", normalizedLanguage], voiceSlotEntryId(textEntry.id, voiceSlot), format, buffer)
      nextEntry.fileName = asset.fileName
      nextEntry.audioHash = asset.contentHash
      nextEntry.input = outputEvidence(status.signature, asset.contentHash, captureOutputReferences(storage, status.identity.kind, status.identity.language))
      c.req.raw.signal.throwIfAborted()
      assertOutputPublication(before, catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath), [identity])
      const outputPath = path.join(audioDir, asset.fileName)

      const mergedEntries = mergeSpeechEntry(
        existingEntries,
        nextEntry,
        languageEntries.map((entry) => entry.id)
      )

      const version = publishSpeechOutput(storage, normalizedLanguage,
        buildUpdatedTtsOutput(storage, normalizedLanguage, mergedEntries, textEntry.id, voiceSlot)
      )


      const completion = getTtsCompletionSummary(
        storage,
        config,
        sourceLanguage,
        voiceMaps
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

    const voiceSlot: VoiceSlot = parsed.data.voiceSlot ?? "primary"

    const credentials = readProviderCredentials(c)
    const geminiApiKey = serverAwareCredentialValue(credentials, "gemini", "apiKey")
    const openaiApiKey = serverAwareCredentialValue(credentials, "openai", "apiKey")
    const azureSpeechKey = serverAwareCredentialValue(credentials, "azure", "apiKey")
    const azureSpeechRegion = serverAwareCredentialValue(credentials, "azure", "region")
    const elevenLabsApiKey = serverAwareCredentialValue(credentials, "elevenlabs", "apiKey")

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
      const configDir = getConfigDir(configPath)
      const voiceMaps = loadVoicesConfig(configDir)
      const defaultSpeechModel =
        config.speech?.model ?? config.default_speech_generation_model
      const profile = resolveSpeechVoice(
        normalizedLanguage,
        voiceSlot,
        config.speech,
        voiceMaps,
        defaultSpeechModel,
      )
      if (!profile) {
        throw new HTTPException(400, {
          message: `Secondary voice is not configured for ${normalizedLanguage}`,
        })
      }
      const { provider, model, voice, label: voiceLabel } = profile
      // The API key is validated against the *resolved* provider rather than
      // always demanding a Gemini key: a book routed to ElevenLabs (or Azure,
      // or OpenAI) has no Gemini key to give, and previously got turned away
      // before this point — making single-item regeneration unreachable for
      // every provider but Gemini.
      const missingKeyMessage = getMissingProviderKeyMessage(provider, {
        geminiApiKey,
        openaiApiKey,
        azureSpeechKey,
        azureSpeechRegion,
        elevenLabsApiKey,
      })
      reconcileSpeechInputs({ storage, config, sourceLanguage, languages: [normalizedLanguage], profiles: loadCoreTtsProfiles(getConfigDir(configPath)), promptsDir, bookDir: path.join(path.resolve(booksDir), safeLabel) })
      const languageEntries = getCatalogEntriesForLanguage(
        storage,
        sourceLanguage,
        normalizedLanguage
      )
      const entryIndex = languageEntries.findIndex(
        (entry) => entry.id === parsed.data.textId
      )
      const textEntry = entryIndex === -1 ? undefined : languageEntries[entryIndex]
      if (!textEntry) {
        throw new HTTPException(404, {
          message: `Text entry not found for ${parsed.data.textId} (${normalizedLanguage})`,
        })
      }

      const before = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath)
      const identity = { kind: "audio" as const, id: textEntry.id, language: normalizedLanguage, voiceSlot }
      const status = before.find((item) => outputIdentityKey(item.identity) === outputIdentityKey(identity))
      const existingEntry = getLatestTtsEntries(storage, normalizedLanguage).find((item) => item.textId === textEntry.id && resolveEntryVoiceSlot(item) === voiceSlot)
      if (!status || status.excluded) throw new HTTPException(409, { message: "This audio is excluded or its input is unavailable." })
      if (status.protected && !parsed.data.replacement) throw new HTTPException(409, { message: "Existing content is protected. Review it and choose Regenerate and replace my edit." })
      if (!selectedForGeneration(status, existingEntry, { replace: parsed.data.replacement ? [parsed.data.replacement] : [] })) {
        return c.json({ entry: existingEntry, version: storage.getLatestNodeData("tts", normalizedLanguage)?.version, reused: true })
      }
      if (missingKeyMessage) throw new HTTPException(400, { message: missingKeyMessage })
      const assertPublication = () => {
        c.req.raw.signal.throwIfAborted()
        assertOutputPublication(before, catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath), [identity])
      }
      const instructionsMap = loadSpeechInstructions(configDir)
      const format = resolveSpeechFormat(provider, config.speech?.format)
      // Cross-provider fallback is deliberately primary-only. A secondary
      // narrator is a specific voice the user picked for this book; retrying it
      // against another provider would quietly narrate the line in a different
      // voice than the one they chose, which is worse than reporting the
      // failure and letting them regenerate it.
      const fallbackAttempts = voiceSlot === "primary"
        ? getSingleItemFallbackAttempts({
            openaiApiKey,
            azureSpeechKey,
            azureSpeechRegion,
            elevenLabsApiKey,
            language: normalizedLanguage,
            providerConfigs,
            // Overlaid the same way resolveSpeechVoice does it, so a book that
            // overrode the fallback provider's voice narrates the retry with
            // its own choice instead of reverting to the global mapping.
            voiceMaps: overlayPrimaryVoices(voiceMaps, config.speech?.primary_voices),
            defaultOpenAIModel: defaultSpeechModel,
            primaryProvider: provider,
          })
        : []
      const bookDir = path.join(path.resolve(booksDir), safeLabel)
      const cacheDir = path.join(bookDir, ".cache")

      // Request parameters recorded on the debug log entry so the settings that
      // produced this audio are inspectable. Takes provider/model/voice per call
      // because a fallback attempt logs a different provider than the primary.
      // ElevenLabs only for now — the other providers' params are a separate change.
      const logParamsFor = (
        targetProvider: string,
        targetModel: string,
        targetVoice: string,
      ): Record<string, unknown> | undefined =>
        targetProvider === "elevenlabs"
          ? buildElevenLabsTtsLogParams({
              model: targetModel,
              voice: targetVoice,
              language: normalizedLanguage,
              format,
              sampleRate: config.speech?.sample_rate,
              bitRate: config.speech?.bit_rate,
              applyTextNormalization: config.speech?.elevenlabs_apply_text_normalization,
              // Must match what generateEntry sends below, or the log would
              // describe a request we didn't make.
              previousText: config.speech?.elevenlabs_use_context
                ? findAdjacentSpeechText(languageEntries, entryIndex, -1, config.speech)
                : undefined,
              nextText: config.speech?.elevenlabs_use_context
                ? findAdjacentSpeechText(languageEntries, entryIndex, 1, config.speech)
                : undefined,
              ...elevenLabsVoiceSettingsFromConfig(config.speech),
            })
          : undefined

      const startMs = Date.now()
      const synthesizeEntry = async (options: {
        targetProvider: string
        targetModel: string
        targetVoice: string
      }) =>
        generateSpeechFile({
          sampleRate: config.speech?.sample_rate, bitRate: config.speech?.bit_rate,
          signal: c.req.raw.signal,
          textId: textEntry.id,
          text: textEntry.text,
          language: normalizedLanguage,
          model: options.targetModel,
          voice: options.targetVoice,
          // Gemini embeds these in the prompt text; OpenAI uses its instructions
          // field. Azure has no instruction channel. Mirrors stage-runner.ts and
          // pipeline-dag.ts so the single-item cache key matches the batch path.
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
                ? createAzureTTSSynthesizer(
                    {
                      subscriptionKey: azureSpeechKey!,
                      region: azureSpeechRegion!,
                    },
                    {
                      sampleRate: config.speech?.sample_rate,
                      bitRate: config.speech?.bit_rate,
                    },
                  )
                : options.targetProvider === "elevenlabs"
                  ? createElevenLabsTTSSynthesizer(
                      { apiKey: elevenLabsApiKey! },
                      // Must match stage-runner.ts and pipeline-dag.ts: without
                      // these, a regenerated entry is synthesized at ElevenLabs'
                      // default mp3_44100_128 while the rest of the book used the
                      // configured rates, and `logParamsFor` below (which does
                      // read them) would report a format we never requested.
                      {
                        sampleRate: config.speech?.sample_rate,
                        bitRate: config.speech?.bit_rate,
                      },
                    )
                  : createTTSSynthesizer(openaiApiKey),
          provider: options.targetProvider,
          voiceSlot,
          voiceLabel,
          geminiTemperature: config.speech?.temperature,
          geminiSeed: config.speech?.seed,
          // ElevenLabs-only: adjacent-entry context, opt-in via
          // elevenlabs_use_context. Must resolve identically to stage-runner.ts
          // and pipeline-dag.ts so the cache key stays in sync across paths.
          elevenLabsPreviousText:
            options.targetProvider === "elevenlabs" && config.speech?.elevenlabs_use_context
              ? findAdjacentSpeechText(languageEntries, entryIndex, -1, config.speech)
              : undefined,
          elevenLabsNextText:
            options.targetProvider === "elevenlabs" && config.speech?.elevenlabs_use_context
              ? findAdjacentSpeechText(languageEntries, entryIndex, 1, config.speech)
              : undefined,
          elevenLabsApplyTextNormalization: config.speech?.elevenlabs_apply_text_normalization,
          // Voice-tuning overrides. Shared helper so this path hashes the same
          // cache key as stage-runner.ts and pipeline-dag.ts.
          ...elevenLabsVoiceSettingsFromConfig(config.speech),
        })

      /**
       * `synthesizeEntry` plus the ElevenLabs 429/5xx retry.
       *
       * ElevenLabs throttles on *concurrent* requests rather than by RPM, so a
       * user clicking regenerate while a run is in flight — or retuning a voice
       * in quick succession, which is what the voice-tuning sliders invite —
       * gets a 429 that both full-run paths retry but this one used to surface
       * as an outright failure. (The cross-provider fallback below can't help:
       * it is gated on Gemini's "did not include audio data".)
       *
       * The retry budget is deliberately smaller than the batch paths': this is
       * a synchronous HTTP handler, so it absorbs the transient concurrency hit
       * without holding the request open long enough to trip a client or proxy
       * timeout. Wrapping here rather than at the call sites covers the fallback
       * attempts too.
       */
      let synthesisAttempts = 0
      const generateEntry = async (options: {
        targetProvider: string
        targetModel: string
        targetVoice: string
      }): Promise<Awaited<ReturnType<typeof synthesizeEntry>>> => {
        for (let attemptCount = 1; ; attemptCount++) {
          synthesisAttempts++
          try {
            return await synthesizeEntry(options)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (
              options.targetProvider !== "elevenlabs" ||
              attemptCount > ELEVENLABS_SINGLE_ITEM_MAX_RETRIES ||
              classifyElevenLabsTtsError(message) === "permanent"
            ) {
              throw err
            }
            const delayMs = elevenLabsTtsRetryDelayMs(attemptCount)
            console.warn(
              `[tts] ${safeLabel}: ElevenLabs TTS failed for ${textEntry.id}; retrying ${attemptCount + 1}/${ELEVENLABS_SINGLE_ITEM_MAX_RETRIES + 1} in ${delayMs}ms: ${message}`
            )
            await new Promise((resolve) => setTimeout(resolve, delayMs))
          }
        }
      }

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
          attempt: synthesisAttempts,
          params: logParamsFor(usedProvider, usedModel, usedVoice),
        })

        if (entry.speechInputSignature && entry.audioHash) entry.input = outputEvidence(entry.speechInputSignature, entry.audioHash, captureOutputReferences(storage, "audio", normalizedLanguage))
        const mergedEntries = mergeSpeechEntry(
          getLatestTtsEntries(storage, normalizedLanguage),
          entry,
          languageEntries.map((item) => item.id)
        )

        assertPublication()
        const version = publishSpeechOutput(storage, normalizedLanguage,
          buildUpdatedTtsOutput(storage, normalizedLanguage, mergedEntries, textEntry.id, voiceSlot)
        )

        const completion = getTtsCompletionSummary(
          storage,
          config,
          sourceLanguage,
          voiceMaps
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
              `${completion.remainingItems} audio item(s) still need generation.`
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
        let failedProvider = provider
        let failedModel = model
        let failedVoice = voice

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
                attempt: synthesisAttempts,
                params: logParamsFor(attempt.provider, attempt.model, attempt.voice),
              })

              if (entry.speechInputSignature && entry.audioHash) entry.input = outputEvidence(entry.speechInputSignature, entry.audioHash, captureOutputReferences(storage, "audio", normalizedLanguage))
              const mergedEntries = mergeSpeechEntry(
                getLatestTtsEntries(storage, normalizedLanguage),
                entry,
                languageEntries.map((item) => item.id)
              )

              assertPublication()
        const version = publishSpeechOutput(storage, normalizedLanguage,
                buildUpdatedTtsOutput(storage, normalizedLanguage, mergedEntries, textEntry.id, voiceSlot)
              )

              const completion = getTtsCompletionSummary(
                storage,
                config,
                sourceLanguage,
                voiceMaps
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
                    `${completion.remainingItems} audio item(s) still need generation.`
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
              failedProvider = attempt.provider
              failedModel = attempt.model
              failedVoice = attempt.voice
            }
          }
        }

        appendSingleTtsLog(storage, {
          textId: textEntry.id,
          language: normalizedLanguage,
          voice: failedVoice,
          model: failedModel,
          provider: failedProvider,
          text: textEntry.text,
          durationMs: Date.now() - startMs,
          success: false,
          cached: false,
          attempt: synthesisAttempts,
          error: fallbackFailureMessage,
          params: logParamsFor(failedProvider, failedModel, failedVoice),
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
        return c.json({ entries: {}, generatedAt: null, version: 0 })
      }
      const data = row.data as WordTimestampOutput
      return c.json({ ...data, version: row.version, entries: Object.fromEntries(Object.entries(data.entries).map(([id, entry]) => [id, { ...entry, version: row.version }])) })
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
      baseVersion: z.number().int().nonnegative(),
      audioHash: z.string().min(1),
      words: z.array(z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      })),
      duration: z.number(),
      voiceSlot: VoiceSlot.optional(),
    }).strict()

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid request: ${parsed.error.message}`,
      })
    }

    const voiceSlot: VoiceSlot = parsed.data.voiceSlot ?? "primary"
    const normalizedLanguage = normalizeLocale(language)
    const storage = createBookStorage(safeLabel, booksDir)

    try {
      const existingRow = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
      assertEditVersion(existingRow?.version, parsed.data.baseVersion)
      const audio = getLatestTtsEntries(storage, normalizedLanguage).find((entry) => entry.textId === textId && resolveEntryVoiceSlot(entry) === voiceSlot)
      if (!audio) throw new HTTPException(404, { message: "Audio not found for these timings." })
      if (!audio.audioHash || audio.audioHash !== parsed.data.audioHash) throw new HTTPException(409, { message: "Audio changed. Refresh before saving timings." })
      const existingData = existingRow
        ? (existingRow.data as WordTimestampOutput)
        : undefined
      const existing = existingData?.entries ?? {}
      const slotEntryId = voiceSlotEntryId(textId, voiceSlot)
      const status = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { timestamps: true })
        .find((output) => output.identity.kind === "timestamps" && output.identity.id === textId && output.identity.language === normalizedLanguage && output.identity.voiceSlot === voiceSlot)

      const updatedEntry: WordTimestampEntry = {
        source: "manual", audioHash: audio.audioHash,
        input: status ? outputEvidence(status.signature, { words: parsed.data.words, duration: parsed.data.duration }) : undefined,
        textId,
        language: normalizedLanguage,
        words: parsed.data.words,
        duration: parsed.data.duration,
        voiceSlot,
      }

      const merged: Record<string, WordTimestampEntry> = {
        ...existing,
        [slotEntryId]: updatedEntry,
      }

      // A manual edit resolves this item — drop it from the failed list while
      // preserving any other still-failed items.
      const remainingFailed = (existingData?.failed ?? []).filter(
        (f) => !(f.textId === textId && resolveEntryVoiceSlot(f) === voiceSlot)
      )

      publishSpeechTimings(storage, normalizedLanguage, {
        entries: merged,
        generatedAt: new Date().toISOString(),
        ...(remainingFailed.length > 0 ? { failed: remainingFailed } : {}),
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

    const voiceSlot: VoiceSlot = parsed.data.voiceSlot ?? "primary"

    const normalizedLanguage = normalizeLocale(parsed.data.language)
    const storage = createBookStorage(safeLabel, booksDir)

    try {
      // Find the audio file for this entry
      const ttsEntries = getLatestTtsEntries(storage, normalizedLanguage)
      const ttsEntry = ttsEntries.find(
        (e) => e.textId === parsed.data.textId && resolveEntryVoiceSlot(e) === voiceSlot
      )
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

      const audioBuffer = readBookAsset(bookDir, path.join("audio", normalizedLanguage, ttsEntry.fileName))
      const baseLanguage = getBaseLanguage(normalizedLanguage)

      const { config, language: sourceLanguage } = getSourceLanguage(storage, booksDir, safeLabel, configPath)
      const speech = reconcileSpeechInputs({ storage, config, sourceLanguage, languages: [normalizedLanguage],
        profiles: loadCoreTtsProfiles(getConfigDir(configPath)), promptsDir, bookDir, persist: false })[0]
      const textPrompt = speech.entries.find((entry) => entry.id === parsed.data.textId)?.speechText ?? undefined

      const before = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { timestamps: true })
      const identity = { kind: "timestamps" as const, id: parsed.data.textId, language: normalizedLanguage, voiceSlot }
      const status = before.find((item) => outputIdentityKey(item.identity) === outputIdentityKey(identity))
      const originalRow = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
      const originalAudioVersion = storage.getLatestNodeData("tts", normalizedLanguage)?.version
      const original = (originalRow?.data as WordTimestampOutput | undefined)?.entries[voiceSlotEntryId(parsed.data.textId, voiceSlot)]
      if (!status || status.excluded) throw new HTTPException(409, { message: "Timing input is no longer available or is excluded." })
      if (status.protected && !parsed.data.replacement) throw new HTTPException(409, { message: "Existing timings are protected. Review before replacing them." })
      if (!selectedForGeneration(status, original, { replace: parsed.data.replacement ? [parsed.data.replacement] : [] })) return c.json({ entry: original, reused: true })
      const openaiApiKey = requireTranscriberKey(readProviderCredentials(c))
      const result = await generateWordTimestamps({
        audioBuffer,
        fileName: ttsEntry.fileName,
        apiKey: openaiApiKey,
        language: baseLanguage,
        prompt: textPrompt,
        cacheDir: path.join(bookDir, ".cache"),
        onLog: (entry) => storage.appendLlmLog(entry),
      })

      const timingAudioHash = (await import("node:crypto")).createHash("sha256").update(audioBuffer).digest("hex")
      const timestampEntry: WordTimestampEntry = {
        source: "ai", audioHash: timingAudioHash,
        input: outputEvidence(timestampInputSignature(timingAudioHash, normalizedLanguage, textPrompt ?? ""), { words: result.words, duration: result.duration }, captureOutputReferences(storage, "timestamps", normalizedLanguage)),
        textId: parsed.data.textId,
        language: normalizedLanguage,
        words: result.words,
        duration: result.duration,
        voiceSlot,
      }

      // Merge into existing timestamps for this language
      const existingRow = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
      const existingData = existingRow
        ? (existingRow.data as WordTimestampOutput)
        : undefined
      const existing = existingData?.entries ?? {}
      const slotEntryId = voiceSlotEntryId(parsed.data.textId, voiceSlot)

      const merged: Record<string, WordTimestampEntry> = {
        ...existing,
        [slotEntryId]: timestampEntry,
      }

      // Successful re-transcription resolves this item — drop it from the failed
      // list while preserving any other still-failed items.
      const remainingFailed = (existingData?.failed ?? []).filter(
        (f) => !(f.textId === parsed.data.textId && resolveEntryVoiceSlot(f) === voiceSlot),
      )

      c.req.raw.signal.throwIfAborted()
      assertEditVersion(storage.getLatestNodeData("tts", normalizedLanguage)?.version, originalAudioVersion ?? 0)
      assertEditVersion(storage.getLatestNodeData("tts-timestamps", normalizedLanguage)?.version, originalRow?.version ?? 0)
      assertOutputPublication(before, catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { timestamps: true }), [identity])
      publishSpeechTimings(storage, normalizedLanguage, {
        entries: merged,
        generatedAt: new Date().toISOString(),
        ...(remainingFailed.length > 0 ? { failed: remainingFailed } : {}),
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

    const parsed = z.object({ language: z.string().min(1), outputScope: OutputRunScope.optional() }).strict().safeParse(body)
    if (!parsed.success) throw new HTTPException(400, { message: `Invalid request: ${parsed.error.message}` })
    const normalizedLanguage = normalizeLocale(parsed.data.language)
    const scope = parsed.data.outputScope
    const select = (storage: ReturnType<typeof createBookStorage>) => {
      const statuses = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { timestamps: true })
      const previous = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)?.data as WordTimestampOutput | undefined
      return getLatestTtsEntries(storage, normalizedLanguage).filter((entry) => {
        const identity = { kind: "timestamps" as const, id: entry.textId, language: normalizedLanguage, voiceSlot: resolveEntryVoiceSlot(entry) }
        const status = statuses.find((item) => outputIdentityKey(item.identity) === outputIdentityKey(identity))
        const audio = statuses.find((item) => item.identity.kind === "audio" && item.identity.id === entry.textId && item.identity.language === normalizedLanguage && item.identity.voiceSlot === identity.voiceSlot)
        return status && audio?.usable && selectedForGeneration(status, previous?.entries[voiceSlotEntryId(entry.textId, identity.voiceSlot)], scope)
      })
    }
    const preStorage = createBookStorage(safeLabel, booksDir)
    let totalToTranscribe: number
    try {
      totalToTranscribe = select(preStorage).length
      if (!totalToTranscribe) return c.json({ taskId: null, count: 0, skipped: getLatestTtsEntries(preStorage, normalizedLanguage).length })
    } finally { preStorage.close() }
    const openaiApiKey = requireTranscriberKey(readProviderCredentials(c))
    if (!taskService) throw new HTTPException(500, { message: "Task service not available" })
    const { taskId } = taskService.submitTask(safeLabel, "transcribe-timestamps",
      `Transcribing ${totalToTranscribe} entries (${normalizedLanguage})`, async (emitProgress) => {
        const storage = createBookStorage(safeLabel, booksDir)
        try {
          // Re-select after shared writer admission. No queued snapshot can
          // authorize replacement of content edited while waiting.
          const entries = select(storage)
          const bookDir = path.join(path.resolve(booksDir), safeLabel)
          const { config, language: sourceLanguage } = getSourceLanguage(storage, booksDir, safeLabel, configPath)
          const speech = reconcileSpeechInputs({ storage, config, sourceLanguage, languages: [normalizedLanguage],
            profiles: loadCoreTtsProfiles(getConfigDir(configPath)), promptsDir, bookDir, persist: false })[0]
          const textMap = new Map(speech.entries.map((entry) => [entry.id, entry.speechText ?? ""]))
          let count = 0
          let failed = 0
          for (const entry of entries) {
            const voiceSlot = resolveEntryVoiceSlot(entry)
            const identity = { kind: "timestamps" as const, id: entry.textId, language: normalizedLanguage, voiceSlot }
            const key = voiceSlotEntryId(entry.textId, voiceSlot)
            const before = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { timestamps: true })
            const timingRow = storage.getLatestNodeData("tts-timestamps", normalizedLanguage)
            const audioVersion = storage.getLatestNodeData("tts", normalizedLanguage)?.version
            const assertCurrent = () => {
              assertEditVersion(storage.getLatestNodeData("tts", normalizedLanguage)?.version, audioVersion ?? 0)
              assertEditVersion(storage.getLatestNodeData("tts-timestamps", normalizedLanguage)?.version, timingRow?.version ?? 0)
              assertOutputPublication(before, catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { timestamps: true }), [identity])
            }
            const previous = timingRow?.data as WordTimestampOutput | undefined
            try {
              const audioBuffer = readBookAsset(bookDir, path.join("audio", normalizedLanguage, entry.fileName))
              const result = await generateWordTimestamps({ audioBuffer, fileName: entry.fileName, apiKey: openaiApiKey,
                language: getBaseLanguage(normalizedLanguage), prompt: textMap.get(entry.textId), cacheDir: path.join(bookDir, ".cache"),
                onLog: (log) => storage.appendLlmLog(log) })
              assertCurrent()
              const audioHash = (await import("node:crypto")).createHash("sha256").update(audioBuffer).digest("hex")
              const timing: WordTimestampEntry = { textId: entry.textId, language: normalizedLanguage, voiceSlot,
                source: "ai", audioHash, words: result.words, duration: result.duration,
                input: outputEvidence(timestampInputSignature(audioHash, normalizedLanguage, textMap.get(entry.textId) ?? ""), { words: result.words, duration: result.duration }, captureOutputReferences(storage, "timestamps", normalizedLanguage)) }
              publishSpeechTimings(storage, normalizedLanguage, { entries: { ...previous?.entries, [key]: timing },
                failed: previous?.failed?.filter((item) => voiceSlotEntryId(item.textId, item.voiceSlot) !== key), generatedAt: new Date().toISOString() })
              count++
            } catch (error) {
              // A conflict aborts without adding a stale failure record. Provider
              // failure preserves prior timings and allows independent work.
              assertCurrent()
              publishSpeechTimings(storage, normalizedLanguage, { entries: previous?.entries ?? {},
                failed: [...(previous?.failed ?? []).filter((item) => voiceSlotEntryId(item.textId, item.voiceSlot) !== key),
                  { textId: entry.textId, voiceSlot, error: error instanceof Error ? error.message : String(error) }],
                generatedAt: new Date().toISOString() })
              failed++
            }
            emitProgress(`${count + failed}/${entries.length}`, Math.round((count + failed) / entries.length * 100))
          }
          return { count, failed, skipped: getLatestTtsEntries(storage, normalizedLanguage).length - entries.length }
        } finally { storage.close() }
      })

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
