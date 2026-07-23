import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { createLLMModel, createPromptEngine, createRateLimiter, createAdaptiveRateLimiter, renderLiquidTemplate } from "@adt/llm"
import type { LlmLogEntry, AdaptiveRateLimiter } from "@adt/llm"
import {
  extractPDF,
  resolveFontsCacheDir,
  buildBookFontsPromptContext,
  readTypography,
  ensureBookGoogleFontsCached,
  extractMetadata,
  buildMetadataConfig,
  classifyPageImages,
  buildImageClassifyConfig,
  sectionPage,
  buildPageSectioningConfig,
  translatePageTree,
  buildTranslationConfig,
  getBaseLanguage,
  normalizeLocale,
  loadBookConfig,
  renderPage,
  buildRenderStrategyResolver,
  collectReferencedImageIds,
  collectSourcePageImages,
  createTemplateEngine,
  // Proof step imports
  captionPageImages,
  buildCaptionConfig,
  extractImageIds,
  regenerateGlossaryPreservingEdits,
  buildGlossaryConfig,
  generateToc,
  buildTocGenerationConfig,
  generateAllQuizzes,
  buildQuizGenerationConfig,
  // Master step imports
  getRenderSectioning,
  buildTextCatalog,
  buildEasyReadConfig,
  buildEasyReadSourceBlocks,
  createEmptyEasyReadOutput,
  generateEasyRead,
  flattenEasyReadEntries,
  isDeterministicEmptyEasyReadOutput,
  translateCatalogBatch,
  buildCatalogTranslationConfig,
  getTargetLanguages,
  translateImage,
  buildImageTranslationConfig,
  loadVoicesConfig,
  loadSpeechInstructions,
  resolveVoice,
  resolveInstructions,
  resolveProviderForLanguage,
  resolveSpeechModel,
  resolveGeminiTtsRateLimit,
  resolveSpeechFormat,
  computeSpeechCacheKey,
  generateSpeechFile,
  generateWordTimestamps,
  stripEmojis,
  generateBookSummary,
  buildBookSummaryConfig,
  filterPageImageMeaningfulness,
  buildMeaningfulnessConfig,
  cropPageImages,
  applyCrops,
  buildCroppingConfig,
  getCroppedImageId,
  segmentPageImages,
  applySegmentation,
  segmentBoundsOnPage,
  buildSegmentationConfig,
  getSegmentedImageId,
  createScreenshotRenderer,
  DEFAULT_VISUAL_REVIEW_MODEL_ID,
  isFixedLayoutBook,
} from "@adt/pipeline"
import type { PageSectioningConfig, TranslationConfig, QuizPageInput, ProviderRouting, MeaningfulnessConfig, CroppingConfig, SegmentationConfig, VisualRefinementDeps } from "@adt/pipeline"
import { loadStyleguideContent } from "./styleguide.js"
import { createTTSSynthesizer, createAzureTTSSynthesizer, createGeminiTTSSynthesizer } from "@adt/llm"
import type { TTSSynthesizer } from "@adt/llm"
import { STAGE_ORDER, isTtsExcluded } from "@adt/types"
import type { PageErrorPolicy, PageErrorAction } from "@adt/types"
import { beginSpeechRun, endSpeechRun } from "./speech-progress.js"
import type {
  AppConfig,
  ImageClassificationOutput,
  PageSectioningOutput,
  WebRenderingOutput,
  ImageCaptioningOutput,
  TextCatalogOutput,
  TextCatalogEntry,
  EasyReadOutput,
  SpeechFileEntry,
  SpeechFailedEntry,
  TTSOutput,
  WordTimestampEntry,
  WordTimestampOutput,
  StepName,
  StageName,
  BookSummaryOutput,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import type { PageData } from "@adt/storage"
import type {
  StageRunner,
  StageRunProgress,
  StageRunOptions,
} from "./stage-service.js"

const DEFAULT_METADATA_PAGES = 3
// Per-item retry budget for a 429/quota response. Higher than a plain fixed
// limiter would need, because the adaptive limiter starts optimistically high
// and takes a few back-off steps to converge on the account's real quota.
const GEMINI_TTS_MAX_RATE_LIMIT_RETRIES = 4
const GEMINI_TTS_DEFAULT_RETRY_DELAY_MS = 6_000
const GEMINI_TTS_MAX_RETRY_DELAY_MS = 20_000
// Backoff for transient server errors (500/empty audio). These clear quickly
// and aren't a rate signal, so they get a shorter delay than a 429 and do not
// throttle the shared limiter.
const GEMINI_TTS_TRANSIENT_RETRY_DELAY_MS = 1_500

class StepError extends Error {
  readonly step: StepName

  constructor(step: StepName, message: string) {
    super(message)
    this.name = "StepError"
    this.step = step
  }
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Thrown at a cancellation checkpoint. Distinguished from real errors so the
 *  general catch neither records step errors nor emits step-error on cancel. */
export class RunCancelledError extends Error {
  constructor(message = "Run cancelled") {
    super(message)
    this.name = "RunCancelledError"
  }
}

/** True when an error is (or was caused by) an abort from one of the given
 *  signals. Detection is by signal state, not error name: the internal timeout
 *  and the external cancel both surface as AbortError/TimeoutError and SDKs wrap
 *  them, so `err.name` is unreliable. A TimeoutError with intact signals is a
 *  normal page failure and returns false here. */
function isCancellation(
  err: unknown,
  signals: Array<AbortSignal | undefined>
): boolean {
  if (err instanceof RunCancelledError) return true
  return signals.some((s) => s?.aborted === true)
}

interface FailedPage {
  pageId: string
  step: StepName
  msg: string
}

/** One-shot admission gate for processWithConcurrency. Closed while a page-error
 *  decision is pending (interactive mode) so no new items start; in-flight work
 *  continues. Opened again once the decision resolves. */
class AdmissionGate {
  private closed = false
  private waiters: Array<() => void> = []
  close(): void {
    this.closed = true
  }
  open(): void {
    this.closed = false
    const waiters = this.waiters
    this.waiters = []
    for (const w of waiters) w()
  }
  wait(): Promise<void> {
    if (!this.closed) return Promise.resolve()
    return new Promise((resolve) => this.waiters.push(resolve))
  }
}

interface PageFailureContext {
  step: StepName
  pageId: string
  err: unknown
  failedPages: FailedPage[]
  /** step name → set of pageIds skipped by user decision (interactive mode). */
  skippedByStep: Map<string, Set<string>>
  progress: StageRunProgress
  runSignal?: AbortSignal
  /** Aborts the current step when the user chooses "stop". */
  stepController: AbortController
  gate: AdmissionGate
  policy: PageErrorPolicy
  requestDecision?: (input: {
    step: StepName
    pageId: string
    error: string
  }) => Promise<PageErrorAction>
}

/** Shared handling for a page failure inside a per-page step. Covers all six
 *  emission points. Returns after recording/handling; throws only to unwind a
 *  run cancel (an aborted page is not a failure — it re-runs cheaply via cache). */
async function handlePageFailure(ctx: PageFailureContext): Promise<void> {
  const { runSignal, stepController } = ctx

  // 1. Run cancel — re-throw so the run tears down at once.
  if (isCancellation(ctx.err, [runSignal])) {
    throw ctx.err instanceof RunCancelledError ? ctx.err : new RunCancelledError()
  }
  // 2. Step already stopping (a prior "stop" decision aborted in-flight work) —
  //    swallow quietly; the step throws its own StepError after the loop.
  if (stepController.signal.aborted) return

  const msg = toErrorMessage(ctx.err)
  // Emit step-error as before (per-page). In interactive mode this briefly paints
  // the step red until the decision resolves; the step-complete hygiene clears it.
  ctx.progress.emit({
    type: "step-error",
    step: ctx.step,
    error: `${ctx.pageId} failed: ${msg}`,
  })

  if (ctx.policy === "ask" && ctx.requestDecision) {
    ctx.gate.close()
    let action: PageErrorAction
    try {
      action = await ctx.requestDecision({
        step: ctx.step,
        pageId: ctx.pageId,
        error: msg,
      })
    } finally {
      ctx.gate.open()
    }
    if (action === "skip") {
      let set = ctx.skippedByStep.get(ctx.step)
      if (!set) {
        set = new Set()
        ctx.skippedByStep.set(ctx.step, set)
      }
      set.add(ctx.pageId)
      return
    }
    // "stop": abort the step. processWithConcurrency stops admitting new items;
    // the step then throws a StepError so it's marked error and later stages halt.
    stepController.abort()
    return
  }

  // Default "stop" policy: accumulate and fail the step at the end.
  ctx.failedPages.push({ pageId: ctx.pageId, step: ctx.step, msg })
}

/** Per-step failure-handling dependencies, built once per page-processing step
 *  and reused for every page. `progress`, `step`, `pageId` and `err` are supplied
 *  per call by reportPageFailure. */
type PageFailureDeps = Omit<
  PageFailureContext,
  "step" | "pageId" | "err" | "progress"
>

/** Build the per-step failure deps from run options. */
function buildPageFailureDeps(
  options: StageRunOptions,
  shared: {
    failedPages: FailedPage[]
    skippedByStep: Map<string, Set<string>>
    gate: AdmissionGate
    stepController: AbortController
  }
): PageFailureDeps {
  return {
    ...shared,
    runSignal: options.signal,
    policy: options.pageErrorPolicy ?? "stop",
    requestDecision: options.requestPageDecision,
  }
}

function reportPageFailure(
  deps: PageFailureDeps,
  progress: StageRunProgress,
  step: StepName,
  pageId: string,
  err: unknown
): Promise<void> {
  return handlePageFailure({ ...deps, progress, step, pageId, err })
}

/** Compose the "Completed — N page(s) skipped" message, or undefined if none. */
function skipMessage(
  skippedByStep: Map<string, Set<string>>,
  step: StepName
): string | undefined {
  const n = skippedByStep.get(step)?.size ?? 0
  return n > 0 ? `Completed — ${n} page(s) skipped` : undefined
}

/** Finalize one page-processing step: throw if it accumulated real failures
 *  ("stop" policy), otherwise emit step-complete (with a skip message if the
 *  user chose to skip pages). */
function finishPageStep(
  progress: StageRunProgress,
  step: StepName,
  deps: Pick<PageFailureDeps, "failedPages" | "skippedByStep">
): void {
  const failures = deps.failedPages.filter((f) => f.step === step)
  if (failures.length > 0) {
    throw new StepError(
      step,
      `${failures.length} page(s) failed:\n${failures
        .map((f) => `${f.pageId}: ${f.msg}`)
        .join("\n")}`
    )
  }
  progress.emit({
    type: "step-complete",
    step,
    message: skipMessage(deps.skippedByStep, step),
  })
}

/**
 * Compare two text catalogs by content (entry id + text, in order). Used to
 * skip writing a new node version when a rebuild produced identical output.
 */
function textCatalogsEqual(
  a: TextCatalogOutput | undefined,
  b: TextCatalogOutput
): boolean {
  if (!a) return false
  if (a.entries.length !== b.entries.length) return false
  for (let i = 0; i < a.entries.length; i++) {
    if (a.entries[i].id !== b.entries[i].id || a.entries[i].text !== b.entries[i].text) {
      return false
    }
  }
  return true
}

function isGeminiTtsRateLimitMessage(message: string): boolean {
  return /\(429\)|quota exceeded|rate limit|too many requests/i.test(message)
}

// Transient Gemini server-side failures that typically clear on a plain retry
// (Google's own 500 message says "Please retry"). Unlike a 429 these are not a
// rate signal, so they must not penalize the adaptive limiter.
function isGeminiTtsTransientError(message: string): boolean {
  return /\(50\d\)|internal error|did not include audio|overloaded|unavailable|try again/i.test(
    message
  )
}

function parseGeminiRetryDelayMs(message: string): number | null {
  const match = message.match(/retry in ([\d.]+)s/i)
  if (!match) return null

  const seconds = Number.parseFloat(match[1])
  if (!Number.isFinite(seconds) || seconds < 0) return null

  const baseMs = Math.ceil(seconds * 1000)
  return Math.min(baseMs > 0 ? baseMs + 250 : 0, GEMINI_TTS_MAX_RETRY_DELAY_MS)
}

/** Resolves early (never rejects) when the signal aborts, so retry backoffs
 *  don't hold a cancelled run open — callers re-check the signal after. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function wrapStepError(step: StepName, err: unknown): never {
  if (err instanceof StepError) throw err
  throw new StepError(step, toErrorMessage(err))
}

export function buildStageRunnerImageClassifyConfig(
  config: AppConfig,
  storage: Pick<Storage, "getImageBase64">
): ReturnType<typeof buildImageClassifyConfig> {
  return {
    ...buildImageClassifyConfig(config),
    getImageBytes: (imageId: string) =>
      Buffer.from(storage.getImageBase64(imageId), "base64"),
  }
}

interface ConcurrencyControls {
  /** Run cancel — never start remaining items; throw RunCancelledError. */
  runSignal?: AbortSignal
  /** Step "stop" — stop admitting new items (in-flight ones finish). */
  stopSignal?: AbortSignal
  /** Pause admission while a page-error decision is pending. */
  gate?: AdmissionGate
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  controls?: ConcurrencyControls
): Promise<void> {
  const executing = new Set<Promise<void>>()
  try {
    for (const item of items) {
      if (controls?.runSignal?.aborted) throw new RunCancelledError()
      if (controls?.gate) await controls.gate.wait()
      // Re-check after the gate: a cancel or "stop" may have arrived while paused.
      if (controls?.runSignal?.aborted) throw new RunCancelledError()
      if (controls?.stopSignal?.aborted) break
      const p = fn(item).finally(() => {
        executing.delete(p)
      })
      executing.add(p)
      if (executing.size >= concurrency) {
        await Promise.race(executing)
      }
    }
    await Promise.all(executing)
  } catch (err) {
    // Drain any still-running items so none are orphaned (which would surface as
    // unhandled rejections when they later abort). On cancel their rejections are
    // expected; swallow them and re-throw a single RunCancelledError.
    await Promise.allSettled(executing)
    if (isCancellation(err, [controls?.runSignal])) throw new RunCancelledError()
    throw err
  }
}

function emitSpeechStepProgress(
  progress: StageRunProgress,
  audioCompleted: number,
  audioTotal: number,
  audioFailures: number,
  reusedTotal = 0,
): void {
  const reusedSuffix = reusedTotal > 0 ? ` (${reusedTotal} reused)` : ""
  const failureSuffix = audioFailures > 0 ? ` (${audioFailures} failed)` : ""
  progress.emit({
    type: "step-progress",
    step: "tts",
    message: `${audioCompleted}/${audioTotal} audio entries${reusedSuffix}${failureSuffix}`,
    page: audioCompleted,
    totalPages: audioTotal,
  })
}

function emitWordTimestampStepProgress(
  progress: StageRunProgress,
  completed: number,
  total: number,
  failures: number,
): void {
  progress.emit({
    type: "step-progress",
    step: "word-timestamps",
    message: `${completed}/${total} entries${failures > 0 ? ` (${failures} failed)` : ""}`,
    page: completed,
    totalPages: total,
  })
}

function resolveSpeechAudioPath(
  bookDir: string,
  language: string,
  fileName: string,
): string | null {
  const audioRoot = path.resolve(bookDir, "audio")
  const normalizedLanguage = normalizeLocale(language)
  const candidateDirs = [
    path.resolve(audioRoot, normalizedLanguage),
    path.resolve(audioRoot, normalizedLanguage.replace("-", "_")),
  ]

  for (const dir of candidateDirs) {
    const resolved = path.resolve(dir, fileName)
    if (!resolved.startsWith(dir + path.sep)) continue
    if (fs.existsSync(resolved)) return resolved
  }

  return null
}

function resolveSpeechOutputPath(
  bookDir: string,
  language: string,
  fileName: string,
): string | null {
  if (!/^[A-Za-z0-9_.-]+$/.test(fileName)) return null

  const audioRoot = path.resolve(bookDir, "audio")
  const audioDir = path.resolve(audioRoot, normalizeLocale(language))
  const outputPath = path.resolve(audioDir, fileName)

  if (audioDir !== audioRoot && !audioDir.startsWith(audioRoot + path.sep)) {
    return null
  }
  if (!outputPath.startsWith(audioDir + path.sep)) {
    return null
  }

  return outputPath
}

function resolveSpeechCachePath(
  cacheDir: string,
  cacheKey: string,
  format: string,
): string | null {
  if (!/^[a-f0-9]{64}$/.test(cacheKey)) return null
  if (!/^[a-z0-9]+$/.test(format)) return null

  const cacheRoot = path.resolve(cacheDir, "tts")
  const cachePath = path.resolve(cacheRoot, `${cacheKey}.${format}`)
  if (!cachePath.startsWith(cacheRoot + path.sep)) {
    return null
  }

  return cachePath
}

function getExistingSpeechEntries(
  storage: Storage,
  language: string,
): Map<string, SpeechFileEntry> {
  const normalizedLanguage = normalizeLocale(language)
  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const row =
    storage.getLatestNodeData("tts", normalizedLanguage) ??
    storage.getLatestNodeData("tts", legacyLanguage)
  const entries = (row?.data as TTSOutput | undefined)?.entries ?? []
  return new Map(entries.map((entry) => [entry.textId, entry]))
}

function canReuseSpeechEntry(
  entry: SpeechFileEntry | undefined,
  options: {
    bookDir: string
    cacheDir: string
    language: string
    text: string
    provider: string
    model: string
    voice: string
    instructions: string
    format: string
  },
): entry is SpeechFileEntry {
  if (!entry) return false

  if (entry.provider === "manual") {
    return resolveSpeechAudioPath(options.bookDir, options.language, entry.fileName) !== null
  }

  const entryProvider = entry.provider ?? "openai"
  if (entryProvider !== options.provider) return false
  if (entry.model !== options.model) return false
  if (entry.voice !== options.voice) return false

  const expectedExt = `.${options.format.toLowerCase()}`
  if (path.extname(entry.fileName).toLowerCase() !== expectedExt) return false

  const sanitized = stripEmojis(options.text).trim()
  const cacheKey = computeSpeechCacheKey({
    text: sanitized,
    voice: options.voice,
    model: options.model,
    instructions: options.instructions,
    provider: options.provider,
  })
  const cachePath = resolveSpeechCachePath(options.cacheDir, cacheKey, options.format.toLowerCase())
  if (!cachePath || !fs.existsSync(cachePath)) return false

  const outputPath = resolveSpeechOutputPath(options.bookDir, options.language, entry.fileName)
  if (!outputPath) return false

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.copyFileSync(cachePath, outputPath)
  return true
}

interface GenerateSpeechWordTimestampsOptions {
  label: string
  bookDir: string
  cacheDir: string
  apiKey?: string
  outputLanguages: string[]
  ttsResultsByLang: Map<string, SpeechFileEntry[]>
  textByLanguage: Map<string, Map<string, string>>
  concurrency: number
  progress: StageRunProgress
  /** Run cancel — stops admitting new transcription items. */
  signal?: AbortSignal
}

async function generateSpeechWordTimestamps(
  options: GenerateSpeechWordTimestampsOptions,
): Promise<{
  entriesByLanguage: Map<string, Record<string, WordTimestampEntry>>
  failedItems: string[]
}> {
  const {
    label,
    bookDir,
    cacheDir,
    apiKey,
    outputLanguages,
    ttsResultsByLang,
    textByLanguage,
    concurrency,
    progress,
    signal,
  } = options

  const entriesByLanguage = new Map<string, Record<string, WordTimestampEntry>>()
  for (const language of outputLanguages) {
    entriesByLanguage.set(language, {})
  }

  if (!apiKey?.trim()) {
    console.warn(`[stage-run] ${label}: skipping word timestamp generation because no OpenAI key was provided`)
    return { entriesByLanguage, failedItems: [] }
  }

  const workItems = outputLanguages.flatMap((language) =>
    (ttsResultsByLang.get(language) ?? []).map((entry) => ({
      language,
      entry,
      prompt: textByLanguage.get(language)?.get(entry.textId),
    }))
  )

  if (workItems.length === 0) {
    return { entriesByLanguage, failedItems: [] }
  }

  const failedItems: string[] = []
  let completed = 0

  emitWordTimestampStepProgress(progress, 0, workItems.length, 0)

  await processWithConcurrency(
    workItems,
    Math.max(1, Math.min(concurrency, 4)),
    async ({ language, entry, prompt }) => {
      try {
        const audioPath = resolveSpeechAudioPath(bookDir, language, entry.fileName)
        if (!audioPath) {
          throw new Error(`Audio file not found: ${entry.fileName}`)
        }

        const audioBuffer = Buffer.from(fs.readFileSync(audioPath))
        const result = await generateWordTimestamps({
          audioBuffer,
          fileName: entry.fileName,
          apiKey,
          language: getBaseLanguage(language),
          prompt,
          cacheDir,
        })
        if (result.cached) {
          console.log(`[stage-run] ${label}: word timestamps cache hit for ${entry.textId} (${language})`)
        }

        entriesByLanguage.get(language)![entry.textId] = {
          textId: entry.textId,
          language,
          words: result.words,
          duration: result.duration,
        }
      } catch (err) {
        const message = toErrorMessage(err)
        failedItems.push(`${language}/${entry.textId}: ${message}`)
        console.warn(
          `[stage-run] ${label}: word timestamp generation failed for ${entry.textId} (${language}): ${message}`,
        )
      } finally {
        completed++
        emitWordTimestampStepProgress(progress, completed, workItems.length, failedItems.length)
      }
    },
    { runSignal: signal },
  )

  return { entriesByLanguage, failedItems }
}

type RunFn = (label: string, options: StageRunOptions, progress: StageRunProgress) => Promise<void>

const STAGE_RUNNERS: Record<StageName, RunFn> = {
  "extract": runExtractStep,
  "sectioning": runSectioningStep,
  "storyboard": runStoryboardStep,
  "quizzes": runQuizzesStep,
  "captions": runCaptionsStep,
  "glossary": runGlossaryStep,
  "toc": runTocStep,
  "easy-read": runEasyReadStep,
  "translate": runTranslateStep,
  "speech": runSpeechStep,
  "package": async () => { /* packaging handled separately */ },
}

/**
 * Creates a stage runner that executes pipeline stages.
 * Supports single stages (fromStage === toStage) and ranges (e.g. extract → storyboard).
 * Stage ordering comes from the shared PIPELINE definition.
 */
export function createStageRunner(): StageRunner {
  return {
    async run(
      label: string,
      options: StageRunOptions,
      progress: StageRunProgress
    ): Promise<void> {
      const { fromStage, toStage, booksDir } = options
      console.log(`[stage-run] ${label}: starting ${fromStage}→${toStage}`)

      const fromIndex = STAGE_ORDER.indexOf(fromStage as StageName)
      const toIndex = STAGE_ORDER.indexOf(toStage as StageName)

      if (fromIndex === -1 || toIndex === -1 || fromIndex > toIndex) {
        throw new Error(`Invalid stage range "${fromStage}" to "${toStage}"`)
      }

      // Wrap progress to persist step lifecycle to the DB.
      // This is the single place where step state transitions are recorded,
      // so the step-status endpoint can read from step_runs.
      const completionStorage = createBookStorage(label, booksDir)
      const runningSteps = new Set<StepName>()
      try {
        const trackingProgress: StageRunProgress = {
          emit(event) {
            if (event.type === "step-start") {
              // Cancellation checkpoint before every step: a cancel that lands
              // between steps stops the run here, before the step is recorded.
              if (options.signal?.aborted) throw new RunCancelledError()
              runningSteps.add(event.step)
              completionStorage.markStepStarted(event.step)
            } else if (event.type === "step-complete") {
              runningSteps.delete(event.step)
              completionStorage.markStepCompleted(event.step, event.message)
            } else if (event.type === "step-skip") {
              runningSteps.delete(event.step)
              completionStorage.markStepSkipped(event.step)
            } else if (event.type === "step-error") {
              runningSteps.delete(event.step)
              completionStorage.recordStepError(event.step, event.error)
            } else if (event.type === "step-progress" && event.message) {
              completionStorage.updateStepMessage(event.step, event.message)
            }
            progress.emit(event)
          },
        }

        for (let i = fromIndex; i <= toIndex; i++) {
          if (options.signal?.aborted) throw new RunCancelledError()
          const stage = STAGE_ORDER[i]
          await STAGE_RUNNERS[stage](label, options, trackingProgress)
        }
      } catch (err) {
        // A cancel is a deliberate action, not a failure: don't record step
        // errors or emit step-error (that would paint the sidebar red and, with
        // the error toast/sound, beep on cancel). Just re-throw — executeJob's
        // abort branch handles persistence cleanup.
        if (isCancellation(err, [options.signal])) {
          throw err
        }
        const message = toErrorMessage(err)
        for (const step of runningSteps) {
          completionStorage.recordStepError(step, message)
          progress.emit({ type: "step-error", step, error: message })
        }
        throw err
      } finally {
        completionStorage.close()
      }

      console.log(`[stage-run] ${label}: completed ${fromStage}→${toStage}`)
    },
  }
}

/**
 * Build request-scoped provider credentials for LLM calls.
 */
function buildLLMCredentials(options: StageRunOptions) {
  return {
    openaiApiKey: options.apiKey,
    anthropicApiKey: options.anthropicApiKey,
    googleApiKey: options.googleApiKey,
    customBaseUrl: options.customBaseUrl,
    customApiKey: options.customApiKey,
  }
}

async function runExtractStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const pdfPath = path.join(path.resolve(booksDir), label, `${label}.pdf`)
    const config = loadBookConfig(label, booksDir, configPath)

    // Step 1: Extract PDF
    console.log(`[stage-run] ${label}: extracting PDF from ${pdfPath}`)
    await extractPDF(
      {
        pdfPath,
        startPage: config.start_page,
        endPage: config.end_page,
        spreadMode: config.spread_mode,
        spreadPairs: config.spread_pairs,
        vectorTextGrouping: config.vector_text_grouping,
        fixedLayout: isFixedLayoutBook(config),
        fontsCacheDir: resolveFontsCacheDir(booksDir),
      },
      storage,
      progress
    )
    console.log(`[stage-run] ${label}: PDF extraction complete`)

    // Step 2: Extract Metadata
    const metadataConfig = buildMetadataConfig(config)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

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

    const metadataModel = createLLMModel({
      modelId: metadataConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
      credentials: llmCredentials,
      signal: options.signal,
    })

    const pages = storage.getPages()
    const metadataPages = pages.slice(0, DEFAULT_METADATA_PAGES)
    const pageInputs = metadataPages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      imageBase64: storage.getPageImageBase64(page.pageId),
    }))

    console.log(`[stage-run] ${label}: extracting metadata from ${metadataPages.length} pages`)
    progress.emit({ type: "step-start", step: "metadata" })
    const metadataResult = await extractMetadata(
      pageInputs,
      metadataConfig,
      metadataModel
    )
    storage.putNodeData("metadata", "book", metadataResult)
    progress.emit({ type: "step-complete", step: "metadata" })
    console.log(`[stage-run] ${label}: metadata complete (lang=${metadataResult.language_code})`)

    // Step 3: Book summary from raw page text (no sectioning required). Written
    // in the book's detected language (just extracted above), not English.
    progress.emit({ type: "step-start", step: "book-summary" })
    try {
      const summaryLanguage = normalizeLocale(
        config.editing_language ?? metadataResult.language_code ?? "en"
      )
      const bookSummaryConfig = buildBookSummaryConfig(config, summaryLanguage)
      const summaryModel = createLLMModel({
        modelId: bookSummaryConfig.modelId,
        cacheDir,
        promptEngine,
        rateLimiter,
        onLog: onLlmLog,
        credentials: llmCredentials,
        signal: options.signal,
      })
      const summaryPages = pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
      }))
      const summaryResult = await generateBookSummary(summaryPages, bookSummaryConfig, summaryModel)
      storage.putNodeData("book-summary", "book", summaryResult)
      progress.emit({ type: "step-complete", step: "book-summary" })
      console.log(`[stage-run] ${label}: book summary complete`)
    } catch (err) {
      // A cancel aborts the summary LLM call — re-throw without emitting
      // step-error so the run tears down cleanly rather than showing a failure.
      if (isCancellation(err, [options.signal])) throw err
      const msg = toErrorMessage(err)
      console.error(`[stage-run] ${label}: book summary failed: ${msg}`)
      progress.emit({ type: "step-error", step: "book-summary", error: msg })
      throw err
    }

    // Step 4: Per-page image classification runs as four sequential passes,
    // each with its own progress reporting so the UI reflects real timing.
    const imageClassifyConfig = buildStageRunnerImageClassifyConfig(config, storage)
    const meaningfulnessConfig = buildMeaningfulnessConfig(config)
    const segmentationConfig = buildSegmentationConfig(config)
    const croppingConfig = buildCroppingConfig(config)

    const meaningfulnessModel = meaningfulnessConfig
      ? createLLMModel({
          modelId: meaningfulnessConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
          credentials: llmCredentials,
          signal: options.signal,
        })
      : null

    const segmentationModel = segmentationConfig
      ? createLLMModel({
          modelId: segmentationConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
          credentials: llmCredentials,
          signal: options.signal,
        })
      : null

    const croppingModel = croppingConfig
      ? createLLMModel({
          modelId: croppingConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
          credentials: llmCredentials,
          signal: options.signal,
        })
      : null

    const effectiveConcurrency = config.concurrency ?? 32
    const totalPages = pages.length
    console.log(`[stage-run] ${label}: classifying images for ${totalPages} pages (concurrency=${effectiveConcurrency})`)

    const pageResults = new Map<string, ImageClassificationOutput>()
    // The four classification passes share one failure/skip/gate/step-controller
    // context: a "stop" decision in any pass halts the whole classification phase,
    // and the end-of-stage throw considers real (non-skipped) failures per step.
    const failedPages: FailedPage[] = []
    const skippedByStep = new Map<string, Set<string>>()
    const gate = new AdmissionGate()
    const stepController = new AbortController()
    const pageFailureDeps = buildPageFailureDeps(options, {
      failedPages,
      skippedByStep,
      gate,
      stepController,
    })

    await runFilterPass(
      label, pages, storage, imageClassifyConfig,
      effectiveConcurrency, pageResults, pageFailureDeps, progress
    )

    if (!stepController.signal.aborted) {
      await runMeaningfulnessPass(
        label, pages, storage, meaningfulnessConfig, meaningfulnessModel,
        effectiveConcurrency, pageResults, pageFailureDeps, progress
      )
    }

    if (!stepController.signal.aborted) {
      await runSegmentationPass(
        label, pages, storage, segmentationConfig, segmentationModel,
        effectiveConcurrency, pageResults, progress, options.signal
      )
    }

    if (!stepController.signal.aborted) {
      await runCroppingPass(
        label, pages, storage, croppingConfig, croppingModel,
        effectiveConcurrency, pageResults, progress, options.signal
      )
    }

    // A "stop" decision aborts the classification phase; the failing step is
    // already recorded as error via its per-page step-error.
    if (stepController.signal.aborted) {
      throw new Error("Stopped by a page-error decision")
    }

    // Only real (non-skipped) failures fail the stage — matches the per-pass
    // step-complete gating in runFilterPass/runMeaningfulnessPass.
    if (failedPages.length > 0) {
      throw new Error(
        `${failedPages.length} page(s) failed:\n${failedPages
          .map((f) => `${f.pageId} [${f.step}]: ${f.msg}`)
          .join("\n")}`
      )
    }
  } finally {
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// Sectioning stage (page-sectioning → translation)
// ---------------------------------------------------------------------------

async function runSectioningStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

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

    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const sourceLanguage = metadata?.language_code ?? null

    const pageSectioningConfig = buildPageSectioningConfig(config)
    const translationConfig = buildTranslationConfig(config, sourceLanguage)

    const structuringModel = createLLMModel({
      modelId: pageSectioningConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
      credentials: llmCredentials,
      signal: options.signal,
    })

    const translationModel = translationConfig
      ? createLLMModel({
          modelId: translationConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
          credentials: llmCredentials,
          signal: options.signal,
        })
      : null

    const pages = storage.getPages()
    const totalPages = pages.length
    const effectiveConcurrency = config.concurrency ?? 32

    // Step 1: page-sectioning per page
    console.log(`[stage-run] ${label}: sectioning ${totalPages} pages (concurrency=${effectiveConcurrency})`)
    progress.emit({ type: "step-start", step: "page-sectioning" })
    let completedStructuring = 0
    let completedTranslation = 0
    const failedPages: FailedPage[] = []
    const skippedByStep = new Map<string, Set<string>>()
    const gate = new AdmissionGate()
    const stepController = new AbortController()
    const pageFailureDeps = buildPageFailureDeps(options, {
      failedPages,
      skippedByStep,
      gate,
      stepController,
    })

    await processWithConcurrency(
      pages,
      effectiveConcurrency,
      async (page: PageData) => {
        try {
          const imageClassRow = storage.getLatestNodeData("image-filtering", page.pageId)
          const imageClassification = (imageClassRow?.data as ImageClassificationOutput) ?? { images: [] }
          const unprunedImageIds = imageClassRow
            ? imageClassification.images.filter((img) => !img.isPruned).map((img) => img.imageId)
            : storage.getPageImages(page.pageId).map((img) => img.imageId)
          const availableImages = unprunedImageIds.map((imageId) => ({
            imageId,
            imageBase64: storage.getImageBase64(imageId),
          }))

          const structuringResult = await sectionPage(
            {
              pageId: page.pageId,
              pageNumber: page.pageNumber,
              text: page.text,
              imageBase64: storage.getPageImageBase64(page.pageId),
              availableImages,
            },
            pageSectioningConfig,
            structuringModel,
          )
          storage.putNodeData("page-sectioning", page.pageId, structuringResult)
          completedStructuring++
          progress.emit({
            type: "step-progress",
            step: "page-sectioning",
            message: `${completedStructuring}/${totalPages}`,
            page: completedStructuring,
            totalPages,
          })

          if (translationConfig && translationModel) {
            const translated = await translatePageTree(
              page.pageId,
              structuringResult,
              translationConfig,
              translationModel,
            )
            storage.putNodeData("page-sectioning", page.pageId, translated)
            completedTranslation++
            progress.emit({
              type: "step-progress",
              step: "translation",
              message: `${completedTranslation}/${totalPages}`,
              page: completedTranslation,
              totalPages,
            })
          }
        } catch (err) {
          const step = err instanceof StepError ? err.step : "page-sectioning"
          console.error(`[stage-run] ${label}: ${page.pageId} failed at ${step}: ${toErrorMessage(err)}`)
          await reportPageFailure(pageFailureDeps, progress, step, page.pageId, err)
        }
      },
      { runSignal: options.signal, stopSignal: stepController.signal, gate },
    )

    if (stepController.signal.aborted) {
      throw new StepError("page-sectioning", "Stopped by a page-error decision")
    }

    finishPageStep(progress, "page-sectioning", pageFailureDeps)
    if (translationConfig) {
      finishPageStep(progress, "translation", pageFailureDeps)
    } else {
      progress.emit({ type: "step-skip", step: "translation" })
    }
  } finally {
    storage.close()
  }
}

async function runStoryboardStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, webAssetsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)
  let visualRefinement: VisualRefinementDeps | undefined

  try {
    const config = loadBookConfig(label, booksDir, configPath)

    const styleguideContent = loadStyleguideContent(config.styleguide, configPath)

    // Render config is always needed
    const resolveRenderConfig = buildRenderStrategyResolver(config)

    // Shared infrastructure for LLM calls
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

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

    // Create template engine
    const templatesDir = path.join(path.dirname(promptsDir), "templates")
    const templateEngine = createTemplateEngine(templatesDir)

    // Create render model resolver (cached factory)
    const renderModels = new Map<string, LLMModel>()
    const resolveRenderModel = (modelId: string): LLMModel => {
      const existing = renderModels.get(modelId)
      if (existing) return existing
      const model = createLLMModel({
        modelId,
        cacheDir,
        promptEngine,
        rateLimiter,
        onLog: onLlmLog,
        credentials: llmCredentials,
        signal: options.signal,
      })
      renderModels.set(modelId, model)
      return model
    }

    // Set up visual refinement if any render strategy enables it
    if (webAssetsDir) {
      const hasVisualRefinement = Object.values(config.render_strategies ?? {}).some(
        (s) => s.config?.visual_refinement?.enabled
      )
      if (hasVisualRefinement) {
        const screenshotRenderer = await createScreenshotRenderer()
        visualRefinement = {
          screenshotRenderer,
          webAssetsDir,
          llmModel: resolveRenderModel(DEFAULT_VISUAL_REVIEW_MODEL_ID),
          storeScreenshot: (base64: string) => {
            const hash = crypto.createHash("sha256").update(base64).digest("hex").slice(0, 16)
            storage.putDebugImage(hash, Buffer.from(base64, "base64"))
          },
        }
      }
    }

    // Get all pages
    const pages = storage.getPages()
    const totalPages = pages.length
    const effectiveConcurrency = config.concurrency ?? 32
    // Book typography (editable size-per-role map) — resolve once, share with all pages.
    const typography = readTypography(storage)

    if (isFixedLayoutBook(config)) {
      // Fixed-layout: build the positioned tree (into `fixed-layout-sectioning`)
      // and render from it, driven off the positioned-text + image-filtering
      // data the extract step already wrote. No LLM call. This is the
      // web-rendering step only — the semantic `page-sectioning` is owned and
      // already produced by the sectioning stage, so we don't re-emit its
      // progress here (that would wrongly re-mark the sectioning stage running).
      console.log(`[stage-run] ${label}: fixed-layout rendering for ${totalPages} pages`)
      progress.emit({ type: "step-start", step: "web-rendering" })
      const { processFixedLayoutPages } = await import("@adt/pipeline")
      const imageUrlPrefix = `/api/books/${label}/images`
      processFixedLayoutPages(storage, imageUrlPrefix)
      progress.emit({ type: "step-complete", step: "web-rendering" })
      console.log(`[stage-run] ${label}: fixed-layout rendering complete`)
      return
    }

    console.log(
      `[stage-run] ${label}: rendering storyboard for ${totalPages} pages (concurrency=${effectiveConcurrency})`
    )

    await ensureBookGoogleFontsCached(storage, resolveFontsCacheDir(booksDir))

    let completedRendering = 0
    const failedPages: FailedPage[] = []
    const skippedByStep = new Map<string, Set<string>>()
    const gate = new AdmissionGate()
    const stepController = new AbortController()
    const pageFailureDeps = buildPageFailureDeps(options, {
      failedPages,
      skippedByStep,
      gate,
      stepController,
    })

    await processWithConcurrency(
      pages,
      effectiveConcurrency,
      async (page: PageData) => {
        try {
          if (options.signal?.aborted) throw new RunCancelledError()

          const structuringRow = storage.getLatestNodeData("page-sectioning", page.pageId)
          if (!structuringRow) {
            console.log(
              `[stage-run] ${label}: skipping ${page.pageId} (no page-sectioning)`
            )
            completedRendering++
            progress.emit({
              type: "step-progress",
              step: "web-rendering",
              message: `${completedRendering}/${totalPages}`,
              page: completedRendering,
              totalPages,
            })
            return
          }
          const sectioning = structuringRow.data as PageSectioningOutput

          const imageClassificationRow = storage.getLatestNodeData(
            "image-filtering",
            page.pageId
          )
          const imageClassification = (imageClassificationRow?.data as ImageClassificationOutput) ?? { images: [] }
          const unprunedImageIds = imageClassificationRow
            ? imageClassification.images.filter((img) => !img.isPruned).map((img) => img.imageId)
            : storage.getPageImages(page.pageId).map((img) => img.imageId)

          const pageDims = new Map(
            storage.getPageImages(page.pageId).map((img) => [img.imageId, { width: img.width, height: img.height }])
          )
          const renderImages = new Map<string, { base64: string; width?: number; height?: number }>()
          for (const imageId of unprunedImageIds) {
            if (options.signal?.aborted) throw new RunCancelledError()
            const dims = pageDims.get(imageId)
            renderImages.set(imageId, { base64: storage.getImageBase64(imageId), width: dims?.width, height: dims?.height })
          }
          // Sections can reference images extracted on other pages (cross-page
          // merges, images added from another page) — those are not in this
          // page's image-filtering output, so pull them in by walking the tree.
          for (const imageId of collectReferencedImageIds(sectioning.sections)) {
            if (renderImages.has(imageId)) continue
            try {
              const dims = storage.getImageDimensions(imageId)
              renderImages.set(imageId, { base64: storage.getImageBase64(imageId), width: dims?.width ?? undefined, height: dims?.height ?? undefined })
            } catch {
              // Image file no longer exists — leave it out; the renderer emits
              // the URL reference without pixels.
            }
          }

          if (options.signal?.aborted) throw new RunCancelledError()
          const pageImageBase64 = storage.getPageImageBase64(page.pageId)
          // Page images for content merged in from other pages (cross-page
          // merges) — per-section provenance recorded in sourcePageIds.
          const sourcePageImages = collectSourcePageImages(
            sectioning.sections,
            (id) => storage.getPageImageBase64(id)
          )

          console.log(`[stage-run] ${label}: rendering ${page.pageId}`)
          const renderResult = await renderPage(
            {
              label,
              pageId: page.pageId,
              pageImageBase64,
              sectioning: sectioning,
              images: renderImages,
              sourcePageImages,
              styleguide: styleguideContent,
              bookFonts: buildBookFontsPromptContext(storage),
              typography,
            },
            resolveRenderConfig,
            resolveRenderModel,
            templateEngine,
            visualRefinement,
            { signal: options.signal },
          )
          if (options.signal?.aborted) throw new RunCancelledError()
          storage.putNodeData("web-rendering", page.pageId, renderResult)
          completedRendering++
          progress.emit({
            type: "step-progress",
            step: "web-rendering",
            message: `${completedRendering}/${totalPages}`,
            page: completedRendering,
            totalPages,
          })
        } catch (err) {
          if (!isCancellation(err, [options.signal])) {
            console.error(
              `[stage-run] ${label}: ${page.pageId} failed at web-rendering: ${toErrorMessage(err)}`
            )
          }
          await reportPageFailure(pageFailureDeps, progress, "web-rendering", page.pageId, err)
        }
      },
      { runSignal: options.signal, stopSignal: stepController.signal, gate },
    )

    if (stepController.signal.aborted) {
      throw new StepError("web-rendering", "Stopped by a page-error decision")
    }

    finishPageStep(progress, "web-rendering", pageFailureDeps)
    console.log(`[stage-run] ${label}: storyboard complete`)
  } finally {
    if (visualRefinement) {
      await visualRefinement.screenshotRenderer.close()
    }
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// Quizzes step
// ---------------------------------------------------------------------------

async function runQuizzesStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    const quizConfig = buildQuizGenerationConfig(config, language)
    if (!quizConfig) {
      progress.emit({ type: "step-skip", step: "quiz-generation" })
      console.log(`[stage-run] ${label}: quizzes skipped (disabled in config)`)
      return
    }

    const quizModel = createLLMModel({
      modelId: quizConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
      credentials: llmCredentials,
      signal: options.signal,
    })

    const effectiveConcurrency = config.concurrency ?? 32

    progress.emit({ type: "step-start", step: "quiz-generation" })

    // Gather page data for quiz generation
    const pages = storage.getPages()
    const quizPages: QuizPageInput[] = []
    for (const page of pages) {
      const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
      const sectioning = getRenderSectioning(storage, page.pageId)
      if (!renderingRow || !sectioning) continue
      quizPages.push({
        pageId: page.pageId,
        rendering: renderingRow.data as WebRenderingOutput,
        sectioning,
      })
    }

    if (quizPages.length > 0) {
      const quizResult = await generateAllQuizzes(quizPages, quizConfig, quizModel, {
        concurrency: effectiveConcurrency,
        onQuizComplete: (completed, total) => {
          progress.emit({
            type: "step-progress",
            step: "quiz-generation",
            message: `${completed}/${total}`,
            page: completed,
            totalPages: total,
          })
        },
      })
      storage.putNodeData("quiz-generation", "book", quizResult)
      progress.emit({
        type: "step-progress",
        step: "quiz-generation",
        message: `${quizResult.quizzes.length} quizzes from ${quizPages.length} pages`,
      })
    }

    progress.emit({ type: "step-complete", step: "quiz-generation" })
    console.log(`[stage-run] ${label}: quizzes complete`)
  } finally {
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// Captions step
// ---------------------------------------------------------------------------

async function runCaptionsStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

    // Load book summary for captioning context
    const summaryRow = storage.getLatestNodeData("book-summary", "book")
    const bookSummary = (summaryRow?.data as BookSummaryOutput | undefined)?.summary

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

    const captionConfig = buildCaptionConfig(config)
    const captionModel = createLLMModel({
      modelId: captionConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
      credentials: llmCredentials,
      signal: options.signal,
    })

    const pages = storage.getPages()
    const totalPages = pages.length
    const effectiveConcurrency = config.concurrency ?? 32
    let completedCaptions = 0
    const failedPages: FailedPage[] = []
    const skippedByStep = new Map<string, Set<string>>()
    const gate = new AdmissionGate()
    const stepController = new AbortController()
    const pageFailureDeps = buildPageFailureDeps(options, {
      failedPages,
      skippedByStep,
      gate,
      stepController,
    })

    progress.emit({ type: "step-start", step: "image-captioning" })
    progress.emit({
      type: "step-progress",
      step: "image-captioning",
      message: `0/${totalPages}`,
      page: 0,
      totalPages,
    })

    console.log(`[stage-run] ${label}: captioning ${totalPages} pages (concurrency=${effectiveConcurrency})`)

    await processWithConcurrency(
      pages,
      effectiveConcurrency,
      async (page: PageData) => {
        try {
          // Get rendered HTML for this page
          const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
          if (!renderingRow) {
            // No rendering — store empty result
            storage.putNodeData("image-captioning", page.pageId, { captions: [] })
            completedCaptions++
            progress.emit({
              type: "step-progress",
              step: "image-captioning",
              message: `${completedCaptions}/${totalPages}`,
              page: completedCaptions,
              totalPages,
            })
            return
          }

          const rendering = renderingRow.data as WebRenderingOutput
          // Filter out pruned sections before extracting image IDs
          const sectioning = getRenderSectioning(storage, page.pageId)
          const htmlSections = rendering.sections
            .filter((s) => !sectioning?.sections[s.sectionIndex]?.isPruned)
            .map((s) => s.html)
          const imageIds = extractImageIds(htmlSections)

          if (imageIds.length === 0) {
            storage.putNodeData("image-captioning", page.pageId, { captions: [] })
            completedCaptions++
            progress.emit({
              type: "step-progress",
              step: "image-captioning",
              message: `${completedCaptions}/${totalPages}`,
              page: completedCaptions,
              totalPages,
            })
            return
          }

          const images = imageIds.map((imageId) => {
            const dims = storage.getImageDimensions(imageId)
            return {
              imageId,
              imageBase64: storage.getImageBase64(imageId),
              width: dims?.width,
              height: dims?.height,
            }
          })
          const pageImageBase64 = storage.getPageImageBase64(page.pageId)

          const result = await captionPageImages(
            { pageId: page.pageId, pageImageBase64, images, language, bookSummary },
            captionConfig,
            captionModel
          )

          // Re-running captioning preserves the user's manual work. An entry the
          // user edited (caption text or the decorative toggle) is marked
          // source:"manual" and is kept wholesale across re-runs; everything
          // else is freshly regenerated and stamped source:"ai". Images that no
          // longer appear on the page simply fall out (their caption is moot).
          const prev = storage.getLatestNodeData("image-captioning", page.pageId)
            ?.data as ImageCaptioningOutput | undefined
          const prevById = new Map(
            (prev?.captions ?? []).map((c) => [c.imageId, c])
          )
          result.captions = result.captions.map((c) => {
            const prior = prevById.get(c.imageId)
            if (prior?.source === "manual") return prior
            return { ...c, source: "ai" as const }
          })

          storage.putNodeData("image-captioning", page.pageId, result)

          completedCaptions++
          progress.emit({
            type: "step-progress",
            step: "image-captioning",
            message: `${completedCaptions}/${totalPages}`,
            page: completedCaptions,
            totalPages,
          })
        } catch (err) {
          await reportPageFailure(pageFailureDeps, progress, "image-captioning", page.pageId, err)
        }
      },
      { runSignal: options.signal, stopSignal: stepController.signal, gate },
    )

    if (stepController.signal.aborted) {
      throw new StepError("image-captioning", "Stopped by a page-error decision")
    }

    finishPageStep(progress, "image-captioning", pageFailureDeps)
    console.log(`[stage-run] ${label}: captions complete`)
  } finally {
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// Glossary step
// ---------------------------------------------------------------------------

async function runGlossaryStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    const glossaryConfig = buildGlossaryConfig(config, language)
    const glossaryModel = createLLMModel({
      modelId: glossaryConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
      credentials: llmCredentials,
      signal: options.signal,
    })

    const pages = storage.getPages()
    const effectiveConcurrency = config.concurrency ?? 32

    progress.emit({ type: "step-start", step: "glossary" })

    console.log(`[stage-run] ${label}: generating glossary from ${pages.length} pages`)

    const glossary = await regenerateGlossaryPreservingEdits({
      storage,
      pages,
      config: glossaryConfig,
      llmModel: glossaryModel,
      concurrency: effectiveConcurrency,
      onBatchComplete: (completed, total) => {
        progress.emit({
          type: "step-progress",
          step: "glossary",
          message: `${completed}/${total}`,
          page: completed,
          totalPages: total,
        })
      },
    })
    storage.putNodeData("glossary", "book", glossary)

    progress.emit({
      type: "step-progress",
      step: "glossary",
      message: `${glossary.items.length} terms from ${glossary.pageCount} pages`,
    })
    progress.emit({ type: "step-complete", step: "glossary" })
    console.log(`[stage-run] ${label}: glossary complete (${glossary.items.length} terms)`)
  } finally {
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// TOC step
// ---------------------------------------------------------------------------

async function runTocStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    const tocConfig = buildTocGenerationConfig(config, language)
    const tocModel = createLLMModel({
      modelId: tocConfig.modelId,
      cacheDir,
      promptEngine,
      rateLimiter,
      onLog: onLlmLog,
      credentials: llmCredentials,
      signal: options.signal,
    })

    const pages = storage.getPages()

    progress.emit({ type: "step-start", step: "toc-generation" })

    console.log(`[stage-run] ${label}: generating TOC from ${pages.length} pages`)

    const toc = await generateToc({
      storage,
      pages,
      config: tocConfig,
      llmModel: tocModel,
    })
    storage.putNodeData("toc-generation", "book", toc)

    progress.emit({
      type: "step-progress",
      step: "toc-generation",
      message: `${toc.entries.length} entries`,
    })
    progress.emit({ type: "step-complete", step: "toc-generation" })
    console.log(`[stage-run] ${label}: TOC complete (${toc.entries.length} entries)`)
  } finally {
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// Easy Read stage (text catalog + Easy Read)
// ---------------------------------------------------------------------------

async function runEasyReadStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    // Output languages — always include the base language so it's treated as a first-class output
    const outputLanguages = Array.from(
      new Set(
        [language, ...(config.output_languages ?? [])].map((code) => normalizeLocale(code))
      )
    )

    // ── Step 1: Build text catalog ──────────────────────────────────
    progress.emit({ type: "step-start", step: "text-catalog" })
    progress.emit({ type: "step-progress", step: "text-catalog", message: "Building text catalog..." })

    console.log(`[stage-run] ${label}: building text catalog from ${pages.length} pages`)

    const catalog = await buildTextCatalog(storage, pages)
    storage.putNodeData("text-catalog", "book", catalog)

    progress.emit({
      type: "step-progress",
      step: "text-catalog",
      message: `${catalog.entries.length} entries`,
    })
    progress.emit({ type: "step-complete", step: "text-catalog" })

    const baseEasyReadConfig = buildEasyReadConfig(config, language)
    const explicitEasyReadRun = options.fromStage === "easy-read" && options.toStage === "easy-read"
    const easyReadConfig = {
      ...baseEasyReadConfig,
      enabled: explicitEasyReadRun || baseEasyReadConfig.enabled,
    }
    let easyReadEntries: TextCatalogEntry[] = []

    if (!easyReadConfig.enabled) {
      progress.emit({ type: "step-skip", step: "easy-read" })
      console.log(`[stage-run] ${label}: easy read skipped (disabled)`)
    } else {
      progress.emit({ type: "step-start", step: "easy-read" })
      const blocks = buildEasyReadSourceBlocks(storage, pages)
      if (blocks.length === 0) {
        const existingEasyRead = storage.getLatestNodeData("easy-read", "book")?.data
        if (!isDeterministicEmptyEasyReadOutput(existingEasyRead)) {
          storage.putNodeData("easy-read", "book", createEmptyEasyReadOutput())
        }
        progress.emit({ type: "step-skip", step: "easy-read" })
        console.log(`[stage-run] ${label}: easy read skipped (no eligible text)`)
      } else {
        const easyReadModel = createLLMModel({
          modelId: easyReadConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
          credentials: llmCredentials,
          signal: options.signal,
        })
        const totalEntries = blocks.reduce((sum, block) => sum + block.entries.length, 0)
        progress.emit({
          type: "step-progress",
          step: "easy-read",
          message: `0/${totalEntries}`,
          page: 0,
          totalPages: totalEntries,
        })
        const easyRead = await generateEasyRead(blocks, easyReadConfig, easyReadModel, {
          concurrency: effectiveConcurrency,
          onProgress: (completed, total) => {
            progress.emit({
              type: "step-progress",
              step: "easy-read",
              message: `${completed}/${total}`,
              page: completed,
              totalPages: total,
            })
          },
        })
        storage.putNodeData("easy-read", "book", easyRead)
        easyReadEntries = flattenEasyReadEntries(easyRead)
        progress.emit({
          type: "step-progress",
          step: "easy-read",
          message: `${easyReadEntries.length} entries`,
        })
        progress.emit({ type: "step-complete", step: "easy-read" })
        console.log(`[stage-run] ${label}: easy read generated ${easyReadEntries.length} entries`)
      }
    }

    console.log(`[stage-run] ${label}: easy read stage complete`)
  } finally {
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// Translate stage (catalog translation + image translation)
// ---------------------------------------------------------------------------

async function runTranslateStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, promptsDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined
    const llmCredentials = buildLLMCredentials(options)

    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

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

    const effectiveConcurrency = config.concurrency ?? 32
    const outputLanguages = Array.from(
      new Set(
        [language, ...(config.output_languages ?? [])].map((code) => normalizeLocale(code))
      )
    )

    // The text-catalog is a derived artifact (a pure read of storyboard +
    // captions + glossary + quizzes, no LLM). It's normally produced by the
    // easy-read stage, but Translate must guarantee a *fresh* catalog rather
    // than trust whatever node happens to exist:
    //   - a standalone translate run (fromStage "translate") never runs
    //     easy-read, and
    //   - GET /text-catalog lazily persists a catalog the moment the book is
    //     viewed; opened before Storyboard renders, that persisted catalog is
    //     empty and previously stuck here (we only rebuilt when the node was
    //     entirely absent), silently skipping all translation.
    // Always rebuild from current data; persist a new version only when the
    // content changed, to avoid version churn on repeated re-runs.
    const pages = storage.getPages()
    const catalog = await buildTextCatalog(storage, pages)
    const existingCatalog = storage.getLatestNodeData("text-catalog", "book")?.data as
      | TextCatalogOutput
      | undefined
    if (!textCatalogsEqual(existingCatalog, catalog)) {
      storage.putNodeData("text-catalog", "book", catalog)
      console.log(
        `[stage-run] ${label}: rebuilt text catalog (${catalog.entries.length} entries)`
      )
    }
    const easyReadRow = storage.getLatestNodeData("easy-read", "book")
    const easyRead = easyReadRow?.data as EasyReadOutput | undefined
    const easyReadEntries = easyRead ? flattenEasyReadEntries(easyRead) : []
    const translationEntries = [...catalog.entries, ...easyReadEntries]

    // ── Step 2: Translate catalog to target languages ────────────────
    const targetLanguages = getTargetLanguages(outputLanguages, language)
    if (targetLanguages.length === 0 || translationEntries.length === 0) {
      progress.emit({ type: "step-skip", step: "catalog-translation" })
      console.log(`[stage-run] ${label}: catalog translation skipped`)
    } else {
      progress.emit({ type: "step-start", step: "catalog-translation" })

      const translationConfig = buildCatalogTranslationConfig(config, language)
      const translationModel = createLLMModel({
        modelId: translationConfig.modelId,
        cacheDir,
        promptEngine,
        rateLimiter,
        onLog: onLlmLog,
        credentials: llmCredentials,
        signal: options.signal,
      })

      const batchSize = translationConfig.batchSize
      interface TranslationWorkItem {
        language: string
        batchIndex: number
        entries: TextCatalogEntry[]
      }
      const workItems: TranslationWorkItem[] = []
      for (const lang of targetLanguages) {
        for (let i = 0; i < translationEntries.length; i += batchSize) {
          workItems.push({
            language: lang,
            batchIndex: Math.floor(i / batchSize),
            entries: translationEntries.slice(i, i + batchSize),
          })
        }
      }

      const totalBatches = workItems.length
      let completedBatches = 0

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

      console.log(`[stage-run] ${label}: translating ${translationEntries.length} entries to ${targetLanguages.length} languages (${totalBatches} batches)`)

      await processWithConcurrency(
        workItems,
        effectiveConcurrency,
        async (item: TranslationWorkItem) => {
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
            message: `${completedBatches}/${totalBatches} batches`,
            page: completedBatches,
            totalPages: totalBatches,
          })
        },
        { runSignal: options.signal },
      )

      for (const lang of targetLanguages) {
        const entries = resultsByLang.get(lang)!
        const idOrder = new Map(translationEntries.map((e, i) => [e.id, i]))
        entries.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))

        const output: TextCatalogOutput = {
          entries,
          generatedAt: new Date().toISOString(),
        }
        storage.putNodeData("text-catalog-translation", lang, output)
      }

      progress.emit({ type: "step-complete", step: "catalog-translation" })
      console.log(`[stage-run] ${label}: catalog translation complete`)
    }

    // ── Step 3: Translate burned-in text in user-selected images ────
    const imageTranslation = buildImageTranslationConfig(config)
    const imageTargetLanguages = getTargetLanguages(outputLanguages, language)
    if (
      !imageTranslation.enabled ||
      imageTranslation.selectedImageIds.length === 0 ||
      imageTargetLanguages.length === 0
    ) {
      // Disabling the step or shrinking the selection should remove stale
      // variants from disk and DB.
      storage.clearTranslatedImages()
      progress.emit({ type: "step-skip", step: "image-translation" })
      console.log(
        `[stage-run] ${label}: image translation skipped ` +
        `(enabled=${imageTranslation.enabled}, selected=${imageTranslation.selectedImageIds.length}, targets=${imageTargetLanguages.length})`
      )
    } else {
      progress.emit({ type: "step-start", step: "image-translation" })

      // Validate prerequisites BEFORE clearing existing variants — a missing
      // API key shouldn't wipe prior work.
      if (!options.apiKey) {
        throw new StepError(
          "image-translation",
          "Image translation requires an OpenAI API key"
        )
      }

      const promptName = config.image_translation?.prompt ?? "image_translation"
      const bookPromptPath = path.join(
        path.resolve(booksDir),
        label,
        "prompts",
        `${promptName}.liquid`
      )
      const globalPromptPath = path.join(
        path.resolve(promptsDir),
        `${promptName}.liquid`
      )
      let templateContent: string | null = null
      if (fs.existsSync(bookPromptPath)) {
        templateContent = fs.readFileSync(bookPromptPath, "utf-8")
      } else if (fs.existsSync(globalPromptPath)) {
        templateContent = fs.readFileSync(globalPromptPath, "utf-8")
      }
      if (!templateContent) {
        throw new StepError(
          "image-translation",
          `Image translation prompt not found: ${promptName}.liquid`
        )
      }
      const promptText = await renderLiquidTemplate(templateContent.trim(), {})

      // Prerequisites validated — safe to clear previously-generated variants so
      // shrinking the selection or changing languages drops stale ones. Cached
      // regeneration is fast for variants we still want.
      storage.clearTranslatedImages()

      // Resolve which selected images actually exist + grab their on-disk paths
      type ImageWork = {
        imageId: string
        pageId: string
        targetLanguage: string
        diskPath: string
      }
      const bookDir = path.join(path.resolve(booksDir), label)
      const items: ImageWork[] = []
      for (const imageId of imageTranslation.selectedImageIds) {
        const meta = storage.getImageMeta(imageId)
        if (!meta) {
          console.warn(`[stage-run] ${label}: image-translation skipping unknown image ${imageId}`)
          continue
        }
        const diskPath = path.resolve(bookDir, meta.relativePath)
        if (!fs.existsSync(diskPath)) {
          console.warn(`[stage-run] ${label}: image-translation skipping missing-on-disk image ${imageId}`)
          continue
        }
        for (const targetLang of imageTargetLanguages) {
          items.push({
            imageId,
            pageId: meta.pageId,
            targetLanguage: targetLang,
            diskPath,
          })
        }
      }

      if (items.length === 0) {
        progress.emit({ type: "step-skip", step: "image-translation" })
        console.log(`[stage-run] ${label}: image translation skipped (no resolvable images)`)
      } else {
        const total = items.length
        let completed = 0
        progress.emit({
          type: "step-progress",
          step: "image-translation",
          message: `0/${total}`,
          page: 0,
          totalPages: total,
        })

        const imageModelId = imageTranslation.modelId
        // Run with low concurrency — image edits are heavy & rate-limited.
        const imageConcurrency = Math.min(effectiveConcurrency, 4)
        await processWithConcurrency(items, imageConcurrency, async (item) => {
          try {
            const buffer = fs.readFileSync(item.diskPath)
            const result = await translateImage({
              apiKey: options.apiKey,
              modelId: imageModelId,
              prompt: promptText,
              sourceLanguage: language,
              targetLanguage: item.targetLanguage,
              imageBuffer: buffer,
              imageName: `${item.imageId}.png`,
              cacheDir,
              log: {
                taskType: "image-translation",
                pageId: item.pageId,
                promptName,
              },
              onLog: onLlmLog,
              signal: options.signal,
            })

            storage.putTranslatedImage({
              sourceImageId: item.imageId,
              pageId: item.pageId,
              languageCode: item.targetLanguage,
              buffer: result.buffer,
              width: result.width,
              height: result.height,
            })
          } catch (err) {
            if (isCancellation(err, [options.signal])) throw err
            const message = toErrorMessage(err)
            console.warn(
              `[stage-run] ${label}: image-translation failed for ${item.imageId} → ${item.targetLanguage}: ${message}`
            )
          } finally {
            completed++
            progress.emit({
              type: "step-progress",
              step: "image-translation",
              message: `${completed}/${total}`,
              page: completed,
              totalPages: total,
            })
          }
        }, { runSignal: options.signal })

        progress.emit({ type: "step-complete", step: "image-translation" })
        console.log(`[stage-run] ${label}: image translation complete (${completed}/${total})`)
      }
    }

    console.log(`[stage-run] ${label}: translate stage complete`)
  } finally {
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// Speech stage (TTS generation)
// ---------------------------------------------------------------------------

async function runSpeechStep(
  label: string,
  options: StageRunOptions,
  progress: StageRunProgress
): Promise<void> {
  const { booksDir, configPath } = options

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookDir = path.join(path.resolve(booksDir), label)
    const configDir = configPath
      ? path.join(path.dirname(configPath), "config")
      : path.resolve(process.cwd(), "config")

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { language_code?: string | null } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")

    const effectiveConcurrency = config.concurrency ?? 32

    // Output languages — always include the base language so TTS is generated for it too
    const outputLanguages = Array.from(
      new Set(
        [language, ...(config.output_languages ?? [])].map((code) => normalizeLocale(code))
      )
    )

    // Load text catalog from storage (produced by translate stage)
    const catalogRow = storage.getLatestNodeData("text-catalog", "book")
    const catalog = catalogRow?.data as TextCatalogOutput | null
    const easyReadConfig = buildEasyReadConfig(config, language)
    const easyReadRow = storage.getLatestNodeData("easy-read", "book")
    // Easy Read audio is generated whenever Easy Read is enabled (all
    // languages), so include the source-language easy-read entries here too.
    const sourceEasyReadEntries = easyReadConfig.enabled
      ? flattenEasyReadEntries(easyReadRow?.data as EasyReadOutput | undefined)
      : []

    if (!catalog || (catalog.entries.length === 0 && sourceEasyReadEntries.length === 0)) {
      progress.emit({ type: "step-skip", step: "tts" })
      progress.emit({ type: "step-skip", step: "word-timestamps" })
      console.log(`[stage-run] ${label}: TTS skipped (empty catalog)`)
      return
    }

    progress.emit({ type: "step-start", step: "tts" })
    progress.emit({ type: "step-progress", step: "tts", message: "Preparing audio..." })

    const voiceMaps = loadVoicesConfig(configDir)
    const instructionsMap = loadSpeechInstructions(configDir)

    const speechModel = config.speech?.model
    const defaultProvider = config.speech?.default_provider ?? "openai"
    const providerConfigs = config.speech?.providers ?? {}
    const routing: ProviderRouting = { providers: providerConfigs, defaultProvider }

    console.log(`[stage-run] ${label}: TTS configDir=${configDir} voiceMaps=${Object.keys(voiceMaps).join(",")||"(empty)"}`)
    console.log(`[stage-run] ${label}: TTS config — defaultProvider=${defaultProvider} model=${speechModel ?? "(provider default)"} format=${config.speech?.format ?? "(provider default)"}`)
    console.log(`[stage-run] ${label}: TTS providers=${JSON.stringify(providerConfigs)}`)
    console.log(`[stage-run] ${label}: TTS azureKey=${options.azureSpeechKey ? "set" : "NOT SET"} azureRegion=${options.azureSpeechRegion ?? "NOT SET"} geminiKey=${options.geminiApiKey ? "set" : "NOT SET"}`)

    const synthesizers = new Map<string, TTSSynthesizer>()
    function getSynthesizer(providerName: string): TTSSynthesizer {
      if (synthesizers.has(providerName)) return synthesizers.get(providerName)!
      console.log(`[stage-run] ${label}: creating TTS synthesizer for provider="${providerName}"`)
      if (providerName === "azure") {
        if (!options.azureSpeechKey || !options.azureSpeechRegion) {
          throw new Error("Azure Speech key and region are required for Azure TTS provider. Set them in the API Keys dialog (gear icon).")
        }
        const synth = createAzureTTSSynthesizer(
          { subscriptionKey: options.azureSpeechKey, region: options.azureSpeechRegion },
          { sampleRate: config.speech?.sample_rate, bitRate: config.speech?.bit_rate }
        )
        synthesizers.set("azure", synth)
        return synth
      }
      if (providerName === "gemini") {
        if (!options.geminiApiKey && !process.env.GEMINI_API_KEY) {
          throw new Error("Gemini API key is required for Gemini TTS provider. Set it in the API Keys dialog (gear icon).")
        }
        const synth = createGeminiTTSSynthesizer(
          options.geminiApiKey ? { apiKey: options.geminiApiKey } : undefined
        )
        synthesizers.set("gemini", synth)
        return synth
      }
      const synth = createTTSSynthesizer(options.apiKey)
      synthesizers.set(providerName, synth)
      return synth
    }

    const sourceLanguage = language

    interface TTSWorkItem {
      textId: string
      text: string
      language: string
    }
    const ttsWorkItems: TTSWorkItem[] = []
    const textByLanguage = new Map<string, Map<string, string>>()
    const ttsResultsByLang = new Map<string, SpeechFileEntry[]>()
    const failedByLang = new Map<string, SpeechFailedEntry[]>()
    const reusedEntriesByLang = new Map<string, number>()
    for (const lang of outputLanguages) {
      ttsResultsByLang.set(lang, [])
      failedByLang.set(lang, [])
      reusedEntriesByLang.set(lang, 0)
    }
    // Expose the (live-mutated) result arrays so GET /tts can serve a
    // progressive snapshot while this run is active. Cleared in `finally`.
    beginSpeechRun(label, ttsResultsByLang, failedByLang)

    for (const lang of outputLanguages) {
      const baseSource = getBaseLanguage(sourceLanguage)
      const baseLang = getBaseLanguage(lang)
      const existingSpeechEntries = getExistingSpeechEntries(storage, lang)

      let entries: TextCatalogEntry[]
      if (baseLang === baseSource) {
        entries = [...catalog.entries, ...sourceEasyReadEntries]
      } else {
        const legacyLang = lang.replace("-", "_")
        const translatedRow =
          storage.getLatestNodeData("text-catalog-translation", lang) ??
          storage.getLatestNodeData("text-catalog-translation", legacyLang)
        if (translatedRow) {
          entries = (translatedRow.data as TextCatalogOutput).entries
        } else {
          console.warn(`[stage-run] ${label}: missing translated catalog for ${lang}, skipping TTS for this language`)
          continue
        }
      }

      const languageTextMap = new Map<string, string>()
      for (const entry of entries) {
        // Excluded entries get no audio at all — not generated, not reused
        // into the new TTS output version.
        if (isTtsExcluded(entry.id, config.speech)) continue
        languageTextMap.set(entry.id, entry.text)

        const provider = resolveProviderForLanguage(lang, routing)
        const providerModel = resolveSpeechModel(provider, providerConfigs, speechModel)
        const outputFormat = resolveSpeechFormat(provider, config.speech?.format)
        const voice = resolveVoice(provider, lang, voiceMaps, config.speech?.voice)
        // OpenAI consumes instructions via its `instructions` field; Gemini embeds
        // them in the prompt text (it rejects systemInstruction). Both paths must
        // resolve identically here and in the generation loop below so the cache key
        // (computeSpeechCacheKey) stays in sync with canReuseSpeechEntry.
        const instructions =
          provider === "openai" || provider === "gemini"
            ? resolveInstructions(lang, instructionsMap)
            : ""
        const existingEntry = existingSpeechEntries.get(entry.id)

        if (
          canReuseSpeechEntry(existingEntry, {
            bookDir,
            cacheDir,
            language: lang,
            text: entry.text,
            provider,
            model: providerModel,
            voice,
            instructions,
            format: outputFormat,
          })
        ) {
          ttsResultsByLang.get(lang)?.push(existingEntry)
          reusedEntriesByLang.set(lang, (reusedEntriesByLang.get(lang) ?? 0) + 1)
          continue
        }

        ttsWorkItems.push({ textId: entry.id, text: entry.text, language: lang })
      }
      textByLanguage.set(lang, languageTextMap)
    }

    const totalItems = ttsWorkItems.length
    let completedItems = 0

    const reusedItems = [...reusedEntriesByLang.values()].reduce((sum, count) => sum + count, 0)
    emitSpeechStepProgress(progress, 0, totalItems, 0, reusedItems)

    console.log(`[stage-run] ${label}: generating TTS for ${totalItems} entries and reusing ${reusedItems} existing entries across ${outputLanguages.length} languages (${outputLanguages.join(", ")})`)
    console.log(`[stage-run] ${label}: TTS routing — for each language: ${outputLanguages.map((l) => `${l}→${resolveProviderForLanguage(l, routing)}`).join(", ")}`)

    const hasGeminiTts = outputLanguages.some(
      (lang) => resolveProviderForLanguage(lang, routing) === "gemini"
    )
    // Adaptive limiter: start at the documented ceiling for the selected model
    // (or a user-pinned value) and back off on 429s, so a generous quota runs
    // fast while a smaller tier self-throttles instead of erroring out.
    const geminiTtsModel = resolveSpeechModel("gemini", providerConfigs, speechModel)
    const geminiTtsRate = resolveGeminiTtsRateLimit({
      model: geminiTtsModel,
      rateLimit: providerConfigs.gemini?.rate_limit,
    })
    const geminiTtsRateLimiter: AdaptiveRateLimiter | undefined = hasGeminiTts
      ? createAdaptiveRateLimiter({
          startRpm: geminiTtsRate.startRpm,
          minRpm: geminiTtsRate.minRpm,
          maxRpm: geminiTtsRate.maxRpm,
        })
      : undefined
    if (geminiTtsRateLimiter) {
      console.log(
        `[stage-run] ${label}: Gemini TTS adaptive limiter — model=${geminiTtsModel} mode=${geminiTtsRate.mode} start=${geminiTtsRate.startRpm} range=${geminiTtsRate.minRpm}-${geminiTtsRate.maxRpm} req/min`
      )
    }

    const failedItems: string[] = []
    const geminiFailedItems: string[] = []

    await processWithConcurrency(
      ttsWorkItems,
      effectiveConcurrency,
      async (item: TTSWorkItem) => {
        const startMs = Date.now()
        const provider = resolveProviderForLanguage(item.language, routing)
        const providerModel = resolveSpeechModel(provider, providerConfigs, speechModel)
        const outputFormat = resolveSpeechFormat(provider, config.speech?.format)
        const voice = resolveVoice(provider, item.language, voiceMaps, config.speech?.voice)
        // Must mirror the reuse-check above: OpenAI + Gemini both receive resolved
        // instructions (Gemini embeds them in the prompt text), Azure does not.
        const instructions =
          provider === "openai" || provider === "gemini"
            ? resolveInstructions(item.language, instructionsMap)
            : ""
        let attemptCount = 0

        console.log(`[stage-run] ${label}: TTS ${item.textId} → provider=${provider} voice=${voice} model=${providerModel} format=${outputFormat}`)

        try {
          const ttsSynthesizer = getSynthesizer(provider)
          let entry: SpeechFileEntry | null

          while (true) {
            attemptCount++
            try {
              entry = await generateSpeechFile({
                textId: item.textId,
                text: item.text,
                language: item.language,
                model: providerModel,
                voice,
                instructions,
                format: outputFormat,
                bookDir,
                cacheDir,
                ttsSynthesizer,
                rateLimiter: provider === "gemini" ? geminiTtsRateLimiter : undefined,
                provider,
                signal: options.signal,
              })
              // A real (non-cached) success means the current rate held —
              // let the limiter probe back toward the ceiling.
              if (provider === "gemini" && entry && !entry.cached) {
                geminiTtsRateLimiter?.reward()
              }
              break
            } catch (err) {
              const msg = toErrorMessage(err)
              const rateLimited =
                provider === "gemini" && isGeminiTtsRateLimitMessage(msg)
              const transient =
                provider === "gemini" &&
                !rateLimited &&
                isGeminiTtsTransientError(msg)
              if (
                (rateLimited || transient) &&
                !options.signal?.aborted &&
                attemptCount <= GEMINI_TTS_MAX_RATE_LIMIT_RETRIES
              ) {
                if (rateLimited) {
                  const retryDelayMs =
                    parseGeminiRetryDelayMs(msg) ??
                    Math.min(
                      GEMINI_TTS_DEFAULT_RETRY_DELAY_MS * attemptCount,
                      GEMINI_TTS_MAX_RETRY_DELAY_MS
                    )
                  // Halve the shared rate and pause all workers for the retry
                  // window, so one 429 throttles the whole batch instead of every
                  // item discovering the limit independently.
                  geminiTtsRateLimiter?.penalize(retryDelayMs)
                  console.warn(
                    `[stage-run] ${label}: Gemini TTS rate limited for ${item.textId} (${item.language}); backing off to ${geminiTtsRateLimiter?.currentRpm() ?? "?"} req/min, retrying ${attemptCount + 1}/${GEMINI_TTS_MAX_RATE_LIMIT_RETRIES + 1} in ${retryDelayMs}ms`
                  )
                  await sleep(retryDelayMs, options.signal)
                  if (options.signal?.aborted) throw new RunCancelledError()
                  continue
                }
                // Transient server error (500/empty audio): retry without
                // penalizing the limiter — it's a Gemini hiccup, not a rate issue.
                const retryDelayMs = Math.min(
                  GEMINI_TTS_TRANSIENT_RETRY_DELAY_MS * attemptCount,
                  GEMINI_TTS_MAX_RETRY_DELAY_MS
                )
                console.warn(
                  `[stage-run] ${label}: Gemini TTS transient error for ${item.textId} (${item.language}); retrying ${attemptCount + 1}/${GEMINI_TTS_MAX_RATE_LIMIT_RETRIES + 1} in ${retryDelayMs}ms: ${msg}`
                )
                await sleep(retryDelayMs, options.signal)
                if (options.signal?.aborted) throw new RunCancelledError()
                continue
              }
              throw err
            }
          }

          const durationMs = Date.now() - startMs
          const cached = entry?.cached ?? false

          const logEntry: LlmLogEntry = {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            taskType: "tts",
            pageId: item.textId,
            promptName: `tts-${provider}`,
            modelId: `${provider}/${providerModel}`,
            cacheHit: cached,
            success: true,
            errorCount: 0,
            attempt: attemptCount,
            durationMs,
            messages: [{
              role: "user",
              content: [{ type: "text" as const, text: `[${item.language}] voice=${voice}\n${item.text.slice(0, 300)}` }],
            }],
          }
          storage.appendLlmLog(logEntry)
          progress.emit({
            type: "llm-log",
            step: "tts",
            itemId: item.textId,
            promptName: logEntry.promptName,
            modelId: logEntry.modelId,
            cacheHit: cached,
            durationMs,
          })

          if (entry) {
            ttsResultsByLang.get(item.language)?.push(entry)
          }
        } catch (err) {
          // Run cancel — re-throw so processWithConcurrency unwinds; an aborted
          // item is not a failure (it re-runs cheaply via the TTS cache).
          if (isCancellation(err, [options.signal])) {
            throw err instanceof RunCancelledError ? err : new RunCancelledError()
          }
          const msg = toErrorMessage(err)
          const durationMs = Date.now() - startMs
          console.error(`[stage-run] ${label}: TTS failed for ${item.textId} (${item.language}): ${msg}`)
          failedItems.push(`${item.textId}: ${msg}`)
          failedByLang.get(item.language)?.push({ textId: item.textId, error: msg })
          if (provider === "gemini") {
            geminiFailedItems.push(`${item.textId}: ${msg}`)
          }

          const logEntry: LlmLogEntry = {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            taskType: "tts",
            pageId: item.textId,
            promptName: `tts-${provider}`,
            modelId: `${provider}/${providerModel}`,
            cacheHit: false,
            success: false,
            errorCount: 1,
            attempt: Math.max(attemptCount, 1),
            durationMs,
            messages: [{
              role: "user",
              content: [{ type: "text" as const, text: `[${item.language}] voice=${voice}\nERROR: ${msg}\n\n${item.text.slice(0, 300)}` }],
            }],
          }
          storage.appendLlmLog(logEntry)
          progress.emit({
            type: "llm-log",
            step: "tts",
            itemId: item.textId,
            promptName: logEntry.promptName,
            modelId: logEntry.modelId,
            cacheHit: false,
            durationMs,
          })
          if (provider !== "gemini") {
            progress.emit({
              type: "step-error",
              step: "tts",
              error: `${item.textId} failed: ${msg}`,
            })
          }
        }

        completedItems++
        emitSpeechStepProgress(progress, completedItems, totalItems, failedItems.length, reusedItems)
      },
      { runSignal: options.signal }
    )

    if (failedItems.length > 0) {
      console.error(`[stage-run] ${label}: ${failedItems.length} TTS item(s) failed:\n${failedItems.join("\n")}`)
    }

    for (const lang of outputLanguages) {
      const entries = ttsResultsByLang.get(lang)
      if (!entries) continue
      const failed = failedByLang.get(lang) ?? []
      const output: TTSOutput = {
        entries,
        generatedAt: new Date().toISOString(),
        ...(failed.length > 0 ? { failed } : {}),
      }
      storage.putNodeData("tts", lang, output)
    }

    if (geminiFailedItems.length > 0) {
      const summary = `${geminiFailedItems.length} Gemini TTS item(s) failed. Missing Gemini audio can be generated one by one from the Speech view.`
      // Complete the step with gaps rather than erroring. The failed items are
      // persisted per-language in the TTS output (`failed`) and surfaced in the
      // Speech/Language view for one-by-one regeneration, so a stray transient
      // failure shouldn't leave the whole stage incomplete and block the export.
      progress.emit({ type: "step-progress", step: "tts", message: summary })
      progress.emit({ type: "step-complete", step: "tts" })
      progress.emit({ type: "step-skip", step: "word-timestamps" })
      console.warn(
        `[stage-run] ${label}: speech completed with ${geminiFailedItems.length} Gemini TTS gap(s)`
      )
      return
    }

    progress.emit({ type: "step-complete", step: "tts" })

    const wordHighlightingEnabled = config.speech?.word_highlighting === true
    let wordTimestampsByLang = new Map<string, Record<string, WordTimestampEntry>>()
    let timestampFailedItems: string[] = []
    if (wordHighlightingEnabled) {
      progress.emit({ type: "step-start", step: "word-timestamps" })
      const generatedWordTimestamps = await generateSpeechWordTimestamps({
        label,
        bookDir,
        cacheDir,
        apiKey: options.apiKey,
        outputLanguages,
        ttsResultsByLang,
        textByLanguage,
        concurrency: effectiveConcurrency,
        progress,
        signal: options.signal,
      })
      wordTimestampsByLang = generatedWordTimestamps.entriesByLanguage
      timestampFailedItems = generatedWordTimestamps.failedItems

      // Only persist tts-timestamps when we actually generated them. When
      // highlighting is disabled, leave existing rows untouched so that
      // manually-calculated timestamps (via the speech view) are preserved
      // across speech re-runs.
      const timestampsGeneratedAt = new Date().toISOString()
      for (const lang of outputLanguages) {
        const entries = wordTimestampsByLang.get(lang) ?? {}
        storage.putNodeData("tts-timestamps", lang, {
          entries,
          generatedAt: timestampsGeneratedAt,
        } satisfies WordTimestampOutput)
      }
    }

    if (!wordHighlightingEnabled) {
      progress.emit({ type: "step-skip", step: "word-timestamps" })
      console.log(`[stage-run] ${label}: word-level highlighting disabled; skipping timestamp generation`)
    } else if (timestampFailedItems.length > 0) {
      console.warn(
        `[stage-run] ${label}: ${timestampFailedItems.length} word timestamp item(s) failed:\n${timestampFailedItems.join("\n")}`,
      )
      progress.emit({
        type: "step-error",
        step: "word-timestamps",
        error: `${timestampFailedItems.length} word timestamp item(s) failed`,
      })
    } else {
      progress.emit({ type: "step-complete", step: "word-timestamps" })
    }

    console.log(`[stage-run] ${label}: speech complete`)
  } finally {
    endSpeechRun(label)
    storage.close()
  }
}

async function runFilterPass(
  label: string,
  pages: PageData[],
  storage: Storage,
  config: ReturnType<typeof buildStageRunnerImageClassifyConfig>,
  concurrency: number,
  results: Map<string, ImageClassificationOutput>,
  deps: PageFailureDeps,
  progress: StageRunProgress,
): Promise<void> {
  const total = pages.length
  let completed = 0
  progress.emit({ type: "step-start", step: "image-filtering" })
  await processWithConcurrency(
    pages,
    concurrency,
    async (page) => {
      try {
        const images = storage.getPageImages(page.pageId)
        const result = classifyPageImages(page.pageId, images, config)
        results.set(page.pageId, result)
        storage.putNodeData("image-filtering", page.pageId, result)
      } catch (err) {
        console.error(`[stage-run] ${label}: ${page.pageId} failed at image-filtering: ${toErrorMessage(err)}`)
        await reportPageFailure(deps, progress, "image-filtering", page.pageId, err)
      } finally {
        completed++
        progress.emit({
          type: "step-progress",
          step: "image-filtering",
          message: `${completed}/${total}`,
          page: completed,
          totalPages: total,
        })
      }
    },
    { runSignal: deps.runSignal, stopSignal: deps.stepController.signal, gate: deps.gate },
  )
  // Only mark the step done when it had no real failures of its own and wasn't
  // stopped. A spurious step-complete here would overwrite the per-page error in
  // the DB with "done", leaving the run failing with no step attributed.
  const failed = deps.failedPages.some((f) => f.step === "image-filtering")
  if (!failed && !deps.stepController.signal.aborted) {
    progress.emit({
      type: "step-complete",
      step: "image-filtering",
      message: skipMessage(deps.skippedByStep, "image-filtering"),
    })
  }
}

async function runMeaningfulnessPass(
  label: string,
  pages: PageData[],
  storage: Storage,
  config: MeaningfulnessConfig | null,
  model: ReturnType<typeof createLLMModel> | null,
  concurrency: number,
  results: Map<string, ImageClassificationOutput>,
  deps: PageFailureDeps,
  progress: StageRunProgress,
): Promise<void> {
  if (!config || !model) {
    progress.emit({ type: "step-skip", step: "image-meaningfulness" })
    return
  }

  const total = pages.length
  let completed = 0
  progress.emit({ type: "step-start", step: "image-meaningfulness" })
  await processWithConcurrency(
    pages,
    concurrency,
    async (page) => {
    const existing = results.get(page.pageId)
    if (!existing) {
      completed++
      progress.emit({
        type: "step-progress",
        step: "image-meaningfulness",
        message: `${completed}/${total}`,
        page: completed,
        totalPages: total,
      })
      return
    }
    try {
      const images = storage.getPageImages(page.pageId)
      const unprunedImageIds = new Set(
        existing.images.filter((img) => !img.isPruned).map((img) => img.imageId)
      )
      const unprunedImages = images
        .filter((img) => unprunedImageIds.has(img.imageId))
        .map((img) => ({
          imageId: img.imageId,
          imageBase64: storage.getImageBase64(img.imageId),
          width: img.width,
          height: img.height,
        }))

      if (unprunedImages.length > 0) {
        const updated = await filterPageImageMeaningfulness(
          {
            pageId: page.pageId,
            pageImageBase64: storage.getPageImageBase64(page.pageId),
            images: unprunedImages,
          },
          existing,
          config,
          model,
        )
        results.set(page.pageId, updated)
        storage.putNodeData("image-filtering", page.pageId, updated)
      }
    } catch (err) {
      console.error(`[stage-run] ${label}: ${page.pageId} failed at image-meaningfulness: ${toErrorMessage(err)}`)
      await reportPageFailure(deps, progress, "image-meaningfulness", page.pageId, err)
    } finally {
      completed++
      progress.emit({
        type: "step-progress",
        step: "image-meaningfulness",
        message: `${completed}/${total}`,
        page: completed,
        totalPages: total,
      })
    }
    },
    { runSignal: deps.runSignal, stopSignal: deps.stepController.signal, gate: deps.gate },
  )
  const failed = deps.failedPages.some((f) => f.step === "image-meaningfulness")
  if (!failed && !deps.stepController.signal.aborted) {
    progress.emit({
      type: "step-complete",
      step: "image-meaningfulness",
      message: skipMessage(deps.skippedByStep, "image-meaningfulness"),
    })
  }
}

async function runSegmentationPass(
  label: string,
  pages: PageData[],
  storage: Storage,
  config: SegmentationConfig | null,
  model: ReturnType<typeof createLLMModel> | null,
  concurrency: number,
  results: Map<string, ImageClassificationOutput>,
  progress: StageRunProgress,
  runSignal?: AbortSignal,
): Promise<void> {
  if (!config || !model) {
    progress.emit({ type: "step-skip", step: "image-segmentation" })
    return
  }

  const total = pages.length
  let completed = 0
  progress.emit({ type: "step-start", step: "image-segmentation" })
  await processWithConcurrency(pages, concurrency, async (page) => {
    const existing = results.get(page.pageId)
    if (!existing) {
      completed++
      progress.emit({
        type: "step-progress",
        step: "image-segmentation",
        message: `${completed}/${total}`,
        page: completed,
        totalPages: total,
      })
      return
    }
    try {
      const images = storage.getPageImages(page.pageId)
      const unprunedIds = new Set(
        existing.images.filter((img) => !img.isPruned).map((img) => img.imageId)
      )
      const segMinSide = config.minSide
      const unprunedImages = images
        .filter((img) => unprunedIds.has(img.imageId))
        .filter((img) => segMinSide === undefined || Math.min(img.width, img.height) >= segMinSide)
        .map((img) => ({
          imageId: img.imageId,
          imageBase64: storage.getImageBase64(img.imageId),
          width: img.width,
          height: img.height,
        }))

      if (unprunedImages.length > 0) {
        const segmentationResult = await segmentPageImages(
          {
            pageId: page.pageId,
            pageImageBase64: storage.getPageImageBase64(page.pageId),
            images: unprunedImages,
          },
          config,
          model,
        )
        const segVersion = storage.putNodeData("image-segmentation", page.pageId, segmentationResult)
        const segDims = new Map(images.map((img) => [img.imageId, { width: img.width, height: img.height }]))
        const applied = applySegmentation(
          segmentationResult,
          (imageId) => storage.getImageBase64(imageId),
          segDims,
        )
        const srcMeta = new Map(images.map((img) => [img.imageId, img]))
        for (const seg of applied) {
          const src = srcMeta.get(seg.sourceImageId)
          const bounds = src?.bounds
            ? segmentBoundsOnPage(src.bounds, src.width, src.height, seg)
            : undefined
          storage.putSegmentedImage({
            sourceImageId: seg.sourceImageId,
            segmentIndex: seg.segmentIndex,
            pageId: page.pageId,
            version: segVersion,
            buffer: seg.buffer,
            width: seg.width,
            height: seg.height,
            bounds,
          })
          existing.images.push({
            imageId: getSegmentedImageId(seg.sourceImageId, seg.segmentIndex, segVersion),
            isPruned: false,
          })
        }
        if (applied.length > 0) {
          const segmentedSourceIds = new Set(applied.map((s) => s.sourceImageId))
          for (const sourceId of segmentedSourceIds) {
            const origEntry = existing.images.find((i) => i.imageId === sourceId)
            if (origEntry) {
              origEntry.isPruned = true
              origEntry.reason = "segmented"
            }
          }
          storage.putNodeData("image-filtering", page.pageId, existing)
        }
      }
    } catch (err) {
      if (isCancellation(err, [runSignal])) throw err
      console.error(`[stage-run] ${label}: image segmentation failed for ${page.pageId}: ${toErrorMessage(err)}`)
    } finally {
      completed++
      progress.emit({
        type: "step-progress",
        step: "image-segmentation",
        message: `${completed}/${total}`,
        page: completed,
        totalPages: total,
      })
    }
  }, { runSignal })
  if (runSignal?.aborted) return
  progress.emit({ type: "step-complete", step: "image-segmentation" })
}

async function runCroppingPass(
  label: string,
  pages: PageData[],
  storage: Storage,
  config: CroppingConfig | null,
  model: ReturnType<typeof createLLMModel> | null,
  concurrency: number,
  results: Map<string, ImageClassificationOutput>,
  progress: StageRunProgress,
  runSignal?: AbortSignal,
): Promise<void> {
  if (!config || !model) {
    progress.emit({ type: "step-skip", step: "image-cropping" })
    return
  }

  const total = pages.length
  let completed = 0
  progress.emit({ type: "step-start", step: "image-cropping" })
  await processWithConcurrency(pages, concurrency, async (page) => {
    const existing = results.get(page.pageId)
    if (!existing) {
      completed++
      progress.emit({
        type: "step-progress",
        step: "image-cropping",
        message: `${completed}/${total}`,
        page: completed,
        totalPages: total,
      })
      return
    }
    try {
      const images = storage.getPageImages(page.pageId)
      const prunedIds = new Set(
        existing.images.filter((img) => img.isPruned).map((img) => img.imageId)
      )
      const unprunedImages = images
        .filter((img) => !prunedIds.has(img.imageId))
        .map((img) => ({
          imageId: img.imageId,
          imageBase64: storage.getImageBase64(img.imageId),
          width: img.width,
          height: img.height,
        }))

      if (unprunedImages.length > 0) {
        const croppingResult = await cropPageImages(
          {
            pageId: page.pageId,
            pageImageBase64: storage.getPageImageBase64(page.pageId),
            images: unprunedImages,
          },
          config,
          model,
        )
        const croppingVersion = storage.putNodeData("image-cropping", page.pageId, croppingResult)
        const applied = applyCrops(
          croppingResult,
          (imageId) => storage.getImageBase64(imageId)
        )
        for (const crop of applied) {
          storage.putCroppedImage({
            imageId: crop.imageId,
            pageId: page.pageId,
            version: croppingVersion,
            buffer: crop.buffer,
            width: crop.width,
            height: crop.height,
          })
          const origEntry = existing.images.find((i) => i.imageId === crop.imageId)
          if (origEntry) {
            origEntry.isPruned = true
            origEntry.reason = "cropped"
          }
          existing.images.push({
            imageId: getCroppedImageId(crop.imageId, croppingVersion),
            isPruned: false,
          })
        }
        if (applied.length > 0) {
          storage.putNodeData("image-filtering", page.pageId, existing)
        }
      }
    } catch (err) {
      if (isCancellation(err, [runSignal])) throw err
      console.error(`[stage-run] ${label}: image cropping failed for ${page.pageId}: ${toErrorMessage(err)}`)
    } finally {
      completed++
      progress.emit({
        type: "step-progress",
        step: "image-cropping",
        message: `${completed}/${total}`,
        page: completed,
        totalPages: total,
      })
    }
  }, { runSignal })
  if (runSignal?.aborted) return
  progress.emit({ type: "step-complete", step: "image-cropping" })
}
