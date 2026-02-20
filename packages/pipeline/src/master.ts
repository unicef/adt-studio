import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage, PageData } from "@adt/storage"
import {
  createLLMModel,
  createPromptEngine,
  createRateLimiter,
  createTTSSynthesizer,
  createAzureTTSSynthesizer,
} from "@adt/llm"
import type { LlmLogEntry, LogLevel, TTSSynthesizer } from "@adt/llm"
import { buildTextCatalog } from "./text-catalog.js"
import { translateCatalogBatch, buildCatalogTranslationConfig, getTargetLanguages } from "./catalog-translation.js"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"
import {
  loadVoicesConfig,
  loadSpeechInstructions,
  resolveVoice,
  resolveInstructions,
  resolveProviderForLanguage,
  generateSpeechFile,
} from "./speech.js"
import type { ProviderRouting } from "./speech.js"
import { loadBookConfig } from "./config.js"
import { nullProgress, type Progress } from "./progress.js"
import { processWithConcurrency } from "./concurrency.js"
import { packageAdtWeb } from "./package-web.js"
import type { StepName, TextCatalogOutput, TextCatalogEntry, SpeechFileEntry, TTSOutput } from "@adt/types"

export interface RunMasterOptions {
  label: string
  booksRoot: string
  promptsDir: string
  configPath?: string
  /** Directory containing config files (voices.yaml, speech_instructions.yaml). */
  configDir?: string
  /** Override cache directory. Defaults to {booksRoot}/{label}/.cache */
  cacheDir?: string
  /** LLM console log level. Defaults to "info". Use "silent" for no output. */
  logLevel?: LogLevel
  /** Path to the ADT runner assets directory (assets/adt/). */
  webAssetsDir?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
}

/**
 * Runs the master stage: builds text catalog, translates, and generates TTS.
 * Requires storyboard to be accepted first.
 *
 * Caller is responsible for setting OPENAI_API_KEY in the environment.
 */
export async function runMaster(
  options: RunMasterOptions,
  progress: Progress = nullProgress
): Promise<void> {
  const { label, booksRoot, promptsDir, configPath, logLevel } = options

  const storage = createBookStorage(label, booksRoot)

  try {
    // Verify storyboard is accepted
    const acceptance = storage.getLatestNodeData(
      "storyboard-acceptance",
      "book"
    )
    if (!acceptance) {
      throw new Error(
        "Storyboard must be accepted before running master"
      )
    }
    const proofStatusRow = storage.getLatestNodeData("proof-status", "book")
    const proofStatus = proofStatusRow?.data as { status?: string } | undefined
    if (proofStatus?.status !== "completed") {
      throw new Error("Proof must be completed before running master")
    }

    // Load config
    const config = loadBookConfig(label, booksRoot, configPath)
    const cacheDir =
      options.cacheDir ?? path.join(path.resolve(booksRoot), label, ".cache")
    const promptEngine = createPromptEngine(promptsDir)
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as {
      language_code?: string | null
    } | null
    const language = normalizeLocale(
      config.editing_language ??
      metadata?.language_code ??
      "en"
    )

    const onLlmLog = (entry: LlmLogEntry) => {
      storage.appendLlmLog(entry)
      const step = entry.taskType as StepName
      progress.emit({
        type: "llm-log",
        step,
        itemId: entry.pageId ?? "",
        promptName: entry.promptName,
        modelId: entry.modelId,
        cacheHit: entry.cacheHit,
        durationMs: entry.durationMs,
        inputTokens: entry.usage?.inputTokens,
        outputTokens: entry.usage?.outputTokens,
        validationErrors: entry.validationErrors,
      })
    }

    const pages = storage.getPages()
    const effectiveConcurrency = config.concurrency ?? 32

    // Output languages default to editing language if not set
    const outputLanguages = Array.from(
      new Set(
        (config.output_languages && config.output_languages.length > 0
          ? config.output_languages
          : [language]).map((code) => normalizeLocale(code))
      )
    )

    // Build text catalog from whatever data is available
    runTextCatalog(pages, storage, progress)

    // Translate catalog to languages that differ from the editing language
    const targetLanguages = getTargetLanguages(outputLanguages, language)
    if (targetLanguages.length > 0) {
      await runCatalogTranslation(
        storage,
        targetLanguages,
        language,
        config,
        cacheDir,
        promptEngine,
        rateLimiter,
        logLevel,
        onLlmLog,
        effectiveConcurrency,
        progress
      )
    } else {
      progress.emit({ type: "step-skip", step: "catalog-translation" })
    }

    // Generate TTS for output languages
    const bookDir = path.join(path.resolve(booksRoot), label)
    const configDir = options.configDir ?? path.resolve(process.cwd(), "config")
    const azureConfig = options.azureSpeechKey && options.azureSpeechRegion
      ? { subscriptionKey: options.azureSpeechKey, region: options.azureSpeechRegion }
      : undefined
    await runTTS(
      storage,
      bookDir,
      language,
      outputLanguages,
      config,
      configDir,
      cacheDir,
      effectiveConcurrency,
      progress,
      azureConfig
    )

    // Package web ADT if webAssetsDir is provided
    if (options.webAssetsDir) {
      const metadataRow = storage.getLatestNodeData("metadata", "book")
      const bookMetadata = metadataRow?.data as { title?: string | null } | null
      const bookTitle = bookMetadata?.title ?? label

      await packageAdtWeb(storage, {
        bookDir,
        label,
        language,
        outputLanguages,
        title: bookTitle,
        webAssetsDir: options.webAssetsDir,
        applyBodyBackground: config.apply_body_background,
      }, progress)
    }
  } finally {
    storage.close()
  }
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function runTextCatalog(
  pages: PageData[],
  storage: Storage,
  progress: Progress
): void {
  progress.emit({ type: "step-start", step: "text-catalog" })
  progress.emit({
    type: "step-progress",
    step: "text-catalog",
    message: "Building text catalog...",
  })

  try {
    const catalog = buildTextCatalog(storage, pages)
    storage.putNodeData("text-catalog", "book", catalog)

    progress.emit({
      type: "step-progress",
      step: "text-catalog",
      message: `${catalog.entries.length} entries`,
    })
    progress.emit({ type: "step-complete", step: "text-catalog" })
  } catch (err) {
    const msg = toErrorMessage(err)
    progress.emit({
      type: "step-error",
      step: "text-catalog",
      error: msg,
    })
    throw new Error(`Text catalog generation failed: ${msg}`)
  }
}

async function runTTS(
  storage: Storage,
  bookDir: string,
  sourceLanguage: string,
  outputLanguages: string[],
  config: ReturnType<typeof loadBookConfig>,
  configDir: string,
  cacheDir: string,
  concurrency: number,
  progress: Progress,
  azureConfig?: { subscriptionKey: string; region: string }
): Promise<void> {
  progress.emit({ type: "step-start", step: "tts" })

  // Load source catalog
  const catalogRow = storage.getLatestNodeData("text-catalog", "book")
  if (!catalogRow) {
    const msg = "No text catalog available for TTS generation"
    progress.emit({
      type: "step-error",
      step: "tts",
      error: msg,
    })
    throw new Error(msg)
  }
  const sourceCatalog = catalogRow.data as TextCatalogOutput

  if (sourceCatalog.entries.length === 0) {
    progress.emit({ type: "step-skip", step: "tts" })
    return
  }

  // Load voice/instruction configs
  const voiceMaps = loadVoicesConfig(configDir)
  const instructionsMap = loadSpeechInstructions(configDir)

  const speechModel = config.speech?.model ?? "gpt-4o-mini-tts"
  const speechFormat = config.speech?.format ?? "mp3"
  const defaultProvider = config.speech?.default_provider ?? "openai"
  const providerConfigs = config.speech?.providers ?? {}
  const routing: ProviderRouting = { providers: providerConfigs, defaultProvider }

  // Lazy per-provider synthesizer cache
  const synthesizers = new Map<string, TTSSynthesizer>()
  function getSynthesizer(providerName: string): TTSSynthesizer {
    if (synthesizers.has(providerName)) return synthesizers.get(providerName)!
    if (providerName === "azure") {
      if (!azureConfig) {
        throw new Error("Azure Speech key and region are required for Azure TTS provider")
      }
      const synth = createAzureTTSSynthesizer(
        azureConfig,
        { sampleRate: config.speech?.sample_rate, bitRate: config.speech?.bit_rate }
      )
      synthesizers.set("azure", synth)
      return synth
    }
    const synth = createTTSSynthesizer()
    synthesizers.set(providerName, synth)
    return synth
  }

  // Build work items for output languages only
  interface TTSWorkItem {
    textId: string
    text: string
    language: string
  }
  const workItems: TTSWorkItem[] = []

  for (const lang of outputLanguages) {
    // For output languages that differ from source, use translated catalog
    const baseSource = getBaseLanguage(sourceLanguage)
    const baseLang = getBaseLanguage(lang)

    let entries: TextCatalogEntry[]
    if (baseLang === baseSource) {
      entries = sourceCatalog.entries
    } else {
      const legacyLang = lang.replace("-", "_")
      const translatedRow =
        storage.getLatestNodeData("text-catalog-translation", lang) ??
        storage.getLatestNodeData("text-catalog-translation", legacyLang)
      if (translatedRow) {
        entries = (translatedRow.data as TextCatalogOutput).entries
      } else {
        throw new Error(
          `Missing translated catalog for output language: ${lang}`
        )
      }
    }

    for (const entry of entries) {
      workItems.push({
        textId: entry.id,
        text: entry.text,
        language: lang,
      })
    }
  }

  const totalItems = workItems.length
  let completedItems = 0

  progress.emit({
    type: "step-progress",
    step: "tts",
    message: `0/${totalItems} entries (${outputLanguages.length} languages)`,
    page: 0,
    totalPages: totalItems,
  })

  const resultsByLang = new Map<string, SpeechFileEntry[]>()
  for (const lang of outputLanguages) {
    resultsByLang.set(lang, [])
  }

  const failedItems: string[] = []

  try {
    await processWithConcurrency(
      workItems,
      concurrency,
      async (item: TTSWorkItem) => {
        try {
          const provider = resolveProviderForLanguage(item.language, routing)
          const providerModel = providerConfigs[provider]?.model ?? (provider === "azure" ? "azure-tts" : speechModel)
          const voice = config.speech?.voice ?? resolveVoice(provider, item.language, voiceMaps)
          const instructions = provider === "openai"
            ? resolveInstructions(item.language, instructionsMap)
            : ""
          const ttsSynthesizer = getSynthesizer(provider)

          const entry = await generateSpeechFile({
            textId: item.textId,
            text: item.text,
            language: item.language,
            model: providerModel,
            voice,
            instructions,
            format: speechFormat,
            bookDir,
            cacheDir,
            ttsSynthesizer,
            provider,
          })

          if (entry) {
            resultsByLang.get(item.language)!.push(entry)
          }
        } catch (err) {
          const msg = toErrorMessage(err)
          failedItems.push(`${item.textId}: ${msg}`)
          progress.emit({
            type: "step-error",
            step: "tts",
            error: `${item.textId} failed: ${msg}`,
          })
        }

        completedItems++
        progress.emit({
          type: "step-progress",
          step: "tts",
          message: `${completedItems}/${totalItems} entries (${outputLanguages.length} languages)${failedItems.length > 0 ? ` [${failedItems.length} failed]` : ""}`,
          page: completedItems,
          totalPages: totalItems,
        })
      }
    )

    // Store per-language TTS metadata
    for (const lang of outputLanguages) {
      const entries = resultsByLang.get(lang)!
      const output: TTSOutput = {
        entries,
        generatedAt: new Date().toISOString(),
      }
      storage.putNodeData("tts", lang, output)
    }

    progress.emit({ type: "step-complete", step: "tts" })
  } catch (err) {
    const msg = toErrorMessage(err)
    progress.emit({
      type: "step-error",
      step: "tts",
      error: msg,
    })
    throw new Error(`TTS generation failed: ${msg}`)
  }
}

async function runCatalogTranslation(
  storage: Storage,
  targetLanguages: string[],
  sourceLanguage: string,
  config: ReturnType<typeof loadBookConfig>,
  cacheDir: string,
  promptEngine: ReturnType<typeof createPromptEngine>,
  rateLimiter: ReturnType<typeof createRateLimiter> | undefined,
  logLevel: LogLevel | undefined,
  onLlmLog: (entry: LlmLogEntry) => void,
  concurrency: number,
  progress: Progress
): Promise<void> {
  progress.emit({ type: "step-start", step: "catalog-translation" })

  const catalogRow = storage.getLatestNodeData("text-catalog", "book")
  if (!catalogRow) {
    const msg = "No text catalog available to translate"
    progress.emit({
      type: "step-error",
      step: "catalog-translation",
      error: msg,
    })
    throw new Error(msg)
  }

  const catalog = catalogRow.data as TextCatalogOutput
  if (catalog.entries.length === 0) {
    progress.emit({ type: "step-skip", step: "catalog-translation" })
    return
  }

  const translationConfig = buildCatalogTranslationConfig(config, sourceLanguage)
  const translationModel = createLLMModel({
    modelId: translationConfig.modelId,
    cacheDir,
    promptEngine,
    rateLimiter,
    logLevel,
    onLog: onLlmLog,
  })

  // Build flat list of work items: {language, batchIndex, entries}
  const batchSize = translationConfig.batchSize
  interface WorkItem {
    language: string
    batchIndex: number
    entries: TextCatalogEntry[]
  }
  const workItems: WorkItem[] = []
  for (const lang of targetLanguages) {
    for (let i = 0; i < catalog.entries.length; i += batchSize) {
      workItems.push({
        language: lang,
        batchIndex: Math.floor(i / batchSize),
        entries: catalog.entries.slice(i, i + batchSize),
      })
    }
  }

  const totalBatches = workItems.length
  let completedBatches = 0

  // Results keyed by language
  const resultsByLang = new Map<string, TextCatalogEntry[]>()
  for (const lang of targetLanguages) {
    resultsByLang.set(lang, [])
  }

  progress.emit({
    type: "step-progress",
    step: "catalog-translation",
    message: `0/${totalBatches} batches (${targetLanguages.length} languages)`,
    page: 0,
    totalPages: totalBatches,
  })

  try {
    await processWithConcurrency(
      workItems,
      concurrency,
      async (item: WorkItem) => {
        const translated = await translateCatalogBatch(
          item.entries,
          item.language,
          translationConfig,
          translationModel
        )
        resultsByLang.get(item.language)!.push(...translated)
        completedBatches++
        progress.emit({
          type: "step-progress",
          step: "catalog-translation",
          message: `${completedBatches}/${totalBatches} batches (${targetLanguages.length} languages)`,
          page: completedBatches,
          totalPages: totalBatches,
        })
      }
    )

    // Store per-language results
    for (const lang of targetLanguages) {
      const entries = resultsByLang.get(lang)!
      // Sort entries back to original catalog order (batches may complete out of order)
      const idOrder = new Map(catalog.entries.map((e, i) => [e.id, i]))
      entries.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))

      const output: TextCatalogOutput = {
        entries,
        generatedAt: new Date().toISOString(),
      }
      storage.putNodeData("text-catalog-translation", lang, output)
    }

    progress.emit({ type: "step-complete", step: "catalog-translation" })
  } catch (err) {
    const msg = toErrorMessage(err)
    progress.emit({
      type: "step-error",
      step: "catalog-translation",
      error: msg,
    })
    throw new Error(`Catalog translation failed: ${msg}`)
  }
}
