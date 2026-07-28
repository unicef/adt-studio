import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import yaml from "js-yaml"
import {
  DEFAULT_OPENAI_TTS_MODEL_ID,
  type SpeechFileEntry,
  type TTSProviderConfig,
  type TTSRateLimitConfig,
} from "@adt/types"
import type { RateLimiter, TTSSynthesizer, WhisperTranscriptionResult } from "@adt/llm"
import { transcribeWithWhisper } from "@adt/llm"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"
import { computeEntryTimeRanges, buildPageTranscript, type BatchEntry } from "./speech-batch.js"
import { sliceWav, wavDurationSeconds, findQuietCutSeconds } from "./audio-wav.js"

// ---------------------------------------------------------------------------
// Emoji stripping
// ---------------------------------------------------------------------------

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]/gu
const SAFE_TEXT_ID_RE = /^[A-Za-z0-9._-]+$/
const SAFE_LANGUAGE_RE = /^[A-Za-z0-9_-]+$/
const SAFE_FORMAT_RE = /^[a-z0-9]+$/
const DEFAULT_OPENAI_VOICE = "alloy"
const DEFAULT_GEMINI_VOICE = "Kore"
const DEFAULT_AZURE_MODEL = "azure-tts"
// Flash is the default: lower latency and higher documented throughput than Pro.
// Users can switch to Pro (or any model) via `speech.providers.gemini.model`.
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-preview-tts"
const DEFAULT_AUDIO_FORMAT = "mp3"
const GEMINI_AUDIO_FORMAT = "wav"

export function stripEmojis(text: string): string {
  if (!text) return text
  return text.replace(EMOJI_RE, "")
}

// ---------------------------------------------------------------------------
// Speakable text check
// ---------------------------------------------------------------------------

/**
 * Returns true if text contains at least one letter or number.
 * Punctuation-only text (e.g. "—", "...") is not speakable.
 */
export function isSpeakableText(text: string): boolean {
  if (!text || !text.trim()) return false
  return /[\p{L}\p{N}]/u.test(text)
}

// ---------------------------------------------------------------------------
// Voice resolution
// ---------------------------------------------------------------------------

export type VoiceMaps = Record<string, Record<string, string>>

export function loadVoicesConfig(configDir: string): VoiceMaps {
  const filePath = path.join(configDir, "voices.yaml")
  if (!fs.existsSync(filePath)) return {}
  return yaml.load(fs.readFileSync(filePath, "utf-8")) as VoiceMaps
}

/**
 * Resolve the voice name for a given provider and language code.
 * Resolution: exact match → base language → default.
 */
export function resolveVoice(
  provider: string,
  languageCode: string,
  voiceMaps: VoiceMaps,
  defaultVoice?: string
): string {
  const normalizedDefaultVoice = defaultVoice?.trim()
  const fallback =
    provider === "gemini" &&
      (!normalizedDefaultVoice || normalizedDefaultVoice === DEFAULT_OPENAI_VOICE)
      ? DEFAULT_GEMINI_VOICE
      : normalizedDefaultVoice || DEFAULT_OPENAI_VOICE
  const providerConfig = voiceMaps[provider]
  if (!providerConfig) return fallback

  const normalized = normalizeLocale(languageCode).toLowerCase()

  // Exact match (e.g. "es-uy")
  if (normalized in providerConfig) return providerConfig[normalized]

  // Base language (e.g. "es" from "es-uy")
  const baseLang = getBaseLanguage(normalized)
  if (baseLang in providerConfig) return providerConfig[baseLang]

  // Default from voices.yaml, then config default, then hardcoded
  return providerConfig["default"] ?? fallback
}

// ---------------------------------------------------------------------------
// Speech instructions resolution
// ---------------------------------------------------------------------------

export type InstructionsMap = Record<string, string>

export function loadSpeechInstructions(configDir: string): InstructionsMap {
  const filePath = path.join(configDir, "speech_instructions.yaml")
  if (!fs.existsSync(filePath)) return {}
  return yaml.load(fs.readFileSync(filePath, "utf-8")) as InstructionsMap
}

/**
 * Resolve accent/pronunciation instructions for a language code.
 * Resolution: exact match → base language → default.
 */
export function resolveInstructions(
  languageCode: string,
  instructionsMap: InstructionsMap
): string {
  const normalized = normalizeLocale(languageCode).toLowerCase()

  if (normalized in instructionsMap) return instructionsMap[normalized]

  const baseLang = getBaseLanguage(normalized)
  if (baseLang in instructionsMap) return instructionsMap[baseLang]

  return instructionsMap["default"] ?? ""
}

// ---------------------------------------------------------------------------
// Provider routing
// ---------------------------------------------------------------------------

export interface ProviderRouting {
  providers: Record<string, TTSProviderConfig>
  defaultProvider: string
}

/**
 * Resolve which TTS provider handles a given language code.
 * Checks each provider's `languages` list for exact match, then base language.
 * Falls back to defaultProvider.
 */
export function resolveProviderForLanguage(
  languageCode: string,
  routing: ProviderRouting
): string {
  const normalized = normalizeLocale(languageCode).toLowerCase()
  const baseLang = getBaseLanguage(normalized)

  for (const [providerName, config] of Object.entries(routing.providers)) {
    if (!config.languages || config.languages.length === 0) continue
    const normalizedLangs = config.languages.map((l: string) =>
      normalizeLocale(l).toLowerCase()
    )
    if (normalizedLangs.includes(normalized)) return providerName
    if (normalizedLangs.includes(baseLang)) return providerName
  }

  return routing.defaultProvider
}

export function resolveSpeechModel(
  provider: string,
  providerConfigs: Record<string, TTSProviderConfig>,
  defaultModel?: string
): string {
  const configuredModel = providerConfigs[provider]?.model?.trim()
  if (configuredModel) return configuredModel

  if (provider === "azure") return DEFAULT_AZURE_MODEL
  if (provider === "gemini") return DEFAULT_GEMINI_MODEL
  return defaultModel?.trim() || DEFAULT_OPENAI_TTS_MODEL_ID
}

export function resolveSpeechFormat(
  provider: string,
  defaultFormat?: string
): string {
  if (provider === "gemini") return GEMINI_AUDIO_FORMAT
  return defaultFormat?.trim().toLowerCase() || DEFAULT_AUDIO_FORMAT
}

// ---------------------------------------------------------------------------
// Gemini TTS rate-limit resolution
// ---------------------------------------------------------------------------

// Documented per-minute request ceilings for Gemini-TTS (Google Cloud TTS QPM:
// flash-tts 150, pro-tts 125). These are used only as the *optimistic starting
// point* for the adaptive limiter — it backs off automatically when the
// account's real Gemini API tier turns out to be lower, so being generous here
// is safe.
const GEMINI_TTS_FLASH_RPM = 150
const GEMINI_TTS_PRO_RPM = 125
const GEMINI_TTS_UNKNOWN_RPM = 100
// Floor the adaptive limiter may drop to. Kept low enough to fall under a
// free-tier quota; recovery (reward) probes back up when calls succeed.
const GEMINI_TTS_MIN_RPM = 3

/** Documented requests-per-minute ceiling for a given Gemini TTS model. */
export function getDocumentedGeminiTtsRpm(model: string): number {
  const normalized = model.toLowerCase()
  if (normalized.includes("flash")) return GEMINI_TTS_FLASH_RPM
  if (normalized.includes("pro")) return GEMINI_TTS_PRO_RPM
  return GEMINI_TTS_UNKNOWN_RPM
}

export interface ResolvedGeminiTtsRateLimit {
  /** "auto" starts at the documented ceiling; "fixed" starts at a user-pinned value. */
  mode: "auto" | "fixed"
  startRpm: number
  minRpm: number
  maxRpm: number
}

/**
 * Resolve the adaptive rate-limiter bounds for Gemini TTS from config.
 *
 * - No config or `requests_per_minute: "auto"` → start at the documented ceiling
 *   for the model and let the limiter self-tune (this is the default).
 * - `requests_per_minute: <number>` → pin the starting ceiling to that number
 *   (the limiter still backs off below it on 429s).
 * - `min_requests_per_minute` / `max_requests_per_minute` override the floor/ceiling.
 */
export function resolveGeminiTtsRateLimit(args: {
  model: string
  rateLimit?: TTSRateLimitConfig
}): ResolvedGeminiTtsRateLimit {
  const documented = getDocumentedGeminiTtsRpm(args.model)
  const rl = args.rateLimit
  const rpm = rl?.requests_per_minute
  const minRpm = Math.max(1, rl?.min_requests_per_minute ?? GEMINI_TTS_MIN_RPM)

  if (rpm === undefined || rpm === "auto") {
    const maxRpm = Math.max(minRpm, rl?.max_requests_per_minute ?? documented)
    return { mode: "auto", startRpm: maxRpm, minRpm, maxRpm }
  }

  // Fixed numeric ceiling: start there, but still allow adaptive back-off.
  const maxRpm = Math.max(minRpm, rl?.max_requests_per_minute ?? rpm)
  return {
    mode: "fixed",
    startRpm: Math.min(rpm, maxRpm),
    minRpm: Math.min(minRpm, rpm),
    maxRpm,
  }
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export function computeSpeechCacheKey(data: {
  text: string
  voice: string
  model: string
  instructions: string
  provider?: string
  /** Gemini sampling params for this item (from SpeechConfig). Only folded
   *  into the key for the Gemini provider, and only when set — an unset value
   *  isn't sent to Gemini, so it must not change the key. */
  geminiTemperature?: number
  geminiSeed?: number
}): string {
  // Gemini output also depends on any sampling params it's sent (temperature +
  // seed), so fold in whichever are set — tuning them regenerates Gemini audio,
  // and clearing them (disabling) also produces a distinct key. Gated on
  // provider so OpenAI/Azure keys are unaffected; a Gemini item with neither
  // set hashes identically to a request that sends no sampling params. Both
  // callers (generateSpeechFile and the stage-runner reuse check) pass
  // `provider`, so they stay in sync automatically.
  const { geminiTemperature, geminiSeed, ...base } = data
  const gemini =
    base.provider === "gemini"
      ? {
          ...(geminiTemperature !== undefined ? { geminiTemperature } : {}),
          ...(geminiSeed !== undefined ? { geminiSeed } : {}),
        }
      : {}
  const json = JSON.stringify({ ...base, ...gemini })
  return crypto.createHash("sha256").update(json).digest("hex")
}

function assertSafeSegment(
  value: string,
  pattern: RegExp,
  name: string
): string {
  if (!pattern.test(value)) {
    throw new Error(`Invalid ${name}: ${value}`)
  }
  return value
}

function assertWithinBase(base: string, target: string, name: string): void {
  const normalizedBase = path.resolve(base)
  const normalizedTarget = path.resolve(target)
  if (
    normalizedTarget !== normalizedBase &&
    !normalizedTarget.startsWith(normalizedBase + path.sep)
  ) {
    throw new Error(`Invalid ${name} path`)
  }
}

// ---------------------------------------------------------------------------
// Speech file generation
// ---------------------------------------------------------------------------

export interface GenerateSpeechFileOptions {
  textId: string
  text: string
  language: string
  model: string
  voice: string
  instructions: string
  format: string
  bookDir: string
  cacheDir: string
  ttsSynthesizer: TTSSynthesizer
  rateLimiter?: RateLimiter
  provider?: string
  /** Gemini sampling params (SpeechConfig temperature/seed). Passed to the
   *  synthesizer and folded into the cache key for the Gemini provider only.
   *  Undefined → not sent; Gemini uses its own defaults (sampling disabled). */
  geminiTemperature?: number
  geminiSeed?: number
  /** Run cancellation — aborts the rate-limiter wait and the TTS request. */
  signal?: AbortSignal
}

/**
 * Generate a single speech file from text using the configured TTS provider.
 * Returns null if text is not speakable.
 * Uses cache to skip re-generation when inputs match.
 */
export async function generateSpeechFile(
  options: GenerateSpeechFileOptions
): Promise<SpeechFileEntry | null> {
  const {
    textId,
    text,
    language,
    model,
    voice,
    instructions,
    format,
    bookDir,
    cacheDir,
    ttsSynthesizer,
    rateLimiter,
    provider,
    geminiTemperature,
    geminiSeed,
    signal,
  } = options

  // Strip emojis and validate
  const sanitized = stripEmojis(text).trim()
  if (!isSpeakableText(sanitized)) return null

  const safeTextId = assertSafeSegment(textId, SAFE_TEXT_ID_RE, "text id")
  const safeFormat = assertSafeSegment(
    format.toLowerCase(),
    SAFE_FORMAT_RE,
    "audio format"
  )
  const normalizedLanguage = assertSafeSegment(
    normalizeLocale(language),
    SAFE_LANGUAGE_RE,
    "language code"
  )

  const hash = computeSpeechCacheKey({
    text: sanitized,
    voice,
    model,
    instructions,
    provider,
    geminiTemperature,
    geminiSeed,
  })

  const fileName = `${safeTextId}.${safeFormat}`
  const audioRoot = path.resolve(bookDir, "audio")
  const audioDir = path.resolve(audioRoot, normalizedLanguage)
  assertWithinBase(audioRoot, audioDir, "audio directory")
  const outputPath = path.resolve(audioDir, fileName)
  assertWithinBase(audioDir, outputPath, "audio file")

  // Check cache
  const cacheRoot = path.resolve(cacheDir, "tts")
  const cachePath = path.resolve(cacheRoot, `${hash}.${safeFormat}`)
  assertWithinBase(cacheRoot, cachePath, "cache file")
  if (fs.existsSync(cachePath)) {
    fs.mkdirSync(audioDir, { recursive: true })
    fs.copyFileSync(cachePath, outputPath)
    return {
      textId: safeTextId,
      language: normalizedLanguage,
      fileName,
      voice,
      model,
      cached: true,
      provider,
    }
  }

  // Generate speech via shared LLM TTS client
  await rateLimiter?.acquire(signal)
  signal?.throwIfAborted()
  const audioBytes = await ttsSynthesizer.synthesize({
    model,
    voice,
    input: sanitized,
    responseFormat: safeFormat,
    instructions: instructions || undefined,
    temperature: geminiTemperature,
    seed: geminiSeed,
    signal,
  })

  const buffer = Buffer.from(audioBytes)

  // Write output file
  fs.mkdirSync(audioDir, { recursive: true })
  fs.writeFileSync(outputPath, buffer)

  // Write to cache
  fs.mkdirSync(cacheRoot, { recursive: true })
  fs.writeFileSync(cachePath, buffer)

  return {
    textId: safeTextId,
    language: normalizedLanguage,
    fileName,
    voice,
    model,
    cached: false,
    provider,
  }
}

// ---------------------------------------------------------------------------
// Page-batched speech generation (experimental)
// ---------------------------------------------------------------------------

export interface GeneratePageSpeechFilesOptions {
  /** Page entries in reading order (already filtered of TTS-excluded ids). */
  entries: BatchEntry[]
  language: string
  model: string
  voice: string
  instructions: string
  /** Must be `wav` — the page audio is sliced sample-accurately. */
  format: string
  bookDir: string
  cacheDir: string
  ttsSynthesizer: TTSSynthesizer
  /** OpenAI key for the Whisper alignment pass that locates sentence bounds. */
  whisperApiKey: string
  rateLimiter?: RateLimiter
  provider?: string
  geminiTemperature?: number
  geminiSeed?: number
  signal?: AbortSignal
}

/**
 * Synthesize a whole page in ONE request so tone stays consistent across
 * sentences, then cut the page audio back into one file per text entry — so
 * the rest of the pipeline (per-entry word timestamps, EPUB SMIL, web reader)
 * is unaffected. Sentence boundaries come from a Whisper pass over the page
 * audio aligned against the known entry texts. Returns one `SpeechFileEntry`
 * per speakable entry, in input order (non-speakable entries are dropped, as in
 * the per-entry path). Requires wav output (Gemini).
 *
 * The page audio is cached on the full ordered transcript + voice/model/
 * instructions/sampling; slicing is deterministic, so re-runs of an unchanged
 * page skip the model entirely and the sliced files are byte-stable (keeping
 * the downstream Whisper word-timestamp cache warm).
 */
export async function generatePageSpeechFiles(
  options: GeneratePageSpeechFilesOptions,
): Promise<SpeechFileEntry[]> {
  const {
    entries, language, model, voice, instructions, format, bookDir, cacheDir,
    ttsSynthesizer, whisperApiKey, rateLimiter, provider, geminiTemperature,
    geminiSeed, signal,
  } = options

  const safeFormat = assertSafeSegment(format.toLowerCase(), SAFE_FORMAT_RE, "audio format")
  if (safeFormat !== "wav") {
    throw new Error(`Page-batched TTS requires wav output; received: ${format}`)
  }
  const normalizedLanguage = assertSafeSegment(
    normalizeLocale(language), SAFE_LANGUAGE_RE, "language code"
  )

  // Keep only speakable entries (mirrors generateSpeechFile's per-item skip).
  const usable = entries
    .map((e) => ({ id: assertSafeSegment(e.id, SAFE_TEXT_ID_RE, "text id"), text: stripEmojis(e.text).trim() }))
    .filter((e) => isSpeakableText(e.text))
  if (usable.length === 0) return []

  const transcript = buildPageTranscript(usable)

  // Page-level cache key: the audio depends on the whole ordered transcript
  // plus the same knobs the per-item key uses.
  const pageHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      entries: usable,
      voice,
      model,
      instructions,
      provider: provider ?? "",
      geminiTemperature,
      geminiSeed,
      v: "batch-page-1",
    }))
    .digest("hex")

  const audioRoot = path.resolve(bookDir, "audio")
  const audioDir = path.resolve(audioRoot, normalizedLanguage)
  assertWithinBase(audioRoot, audioDir, "audio directory")

  const pageCacheRoot = path.resolve(cacheDir, "tts-page")
  const pageCachePath = path.resolve(pageCacheRoot, `${pageHash}.${safeFormat}`)
  assertWithinBase(pageCacheRoot, pageCachePath, "page cache file")

  // 1) One synthesis request for the whole page (cached).
  let pageBytes: Buffer
  let cached = false
  if (fs.existsSync(pageCachePath)) {
    pageBytes = fs.readFileSync(pageCachePath)
    cached = true
  } else {
    await rateLimiter?.acquire(signal)
    signal?.throwIfAborted()
    const audioBytes = await ttsSynthesizer.synthesize({
      model,
      voice,
      input: transcript,
      responseFormat: safeFormat,
      instructions: instructions || undefined,
      temperature: geminiTemperature,
      seed: geminiSeed,
      signal,
    })
    pageBytes = Buffer.from(audioBytes)
    fs.mkdirSync(pageCacheRoot, { recursive: true })
    fs.writeFileSync(pageCachePath, pageBytes)
  }

  // 2) Whisper the page (cached on audio hash) to find word onsets.
  const whisper = await generateWordTimestamps({
    audioBuffer: pageBytes,
    fileName: `${pageHash}.${safeFormat}`,
    apiKey: whisperApiKey,
    language: getBaseLanguage(language),
    prompt: transcript,
    cacheDir,
  })

  // 3) Slice the page audio into per-entry files at sentence boundaries.
  const totalDuration = wavDurationSeconds(pageBytes)
  const ranges = computeEntryTimeRanges(usable, whisper.words, totalDuration)

  // Snap each interior cut back into the quiet gap just before the next
  // sentence's first word, so boundaries land in the natural pause rather than
  // on a word attack (avoids clipped onsets / boundary clicks). The shared
  // boundary moves for both adjacent slices, keeping them contiguous.
  for (let k = 1; k < ranges.length; k++) {
    const snapped = findQuietCutSeconds(pageBytes, ranges[k].start, PAGE_SLICE_SNAP_WINDOW_SEC)
    const bounded = Math.min(Math.max(snapped, ranges[k - 1].start), totalDuration)
    ranges[k].start = bounded
    ranges[k - 1].end = bounded
  }

  fs.mkdirSync(audioDir, { recursive: true })
  const results: SpeechFileEntry[] = []
  for (const range of ranges) {
    signal?.throwIfAborted()
    // A short edge fade guarantees zero-amplitude slice edges (belt-and-braces
    // with the silence-snap above) so back-to-back playback has no clicks.
    const slice = sliceWav(pageBytes, range.start, range.end, PAGE_SLICE_FADE_MS)
    const fileName = `${range.id}.${safeFormat}`
    const outputPath = path.resolve(audioDir, fileName)
    assertWithinBase(audioDir, outputPath, "audio file")
    // Only write when the bytes actually change, so an unchanged slice keeps its
    // mtime — GET /tts derives its cache-busting `?v=` from mtime, so rewriting
    // identical audio every run would force the reader to refetch needlessly.
    if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(slice)) {
      fs.writeFileSync(outputPath, slice)
    }
    results.push({ textId: range.id, language: normalizedLanguage, fileName, voice, model, cached, provider })
  }
  return results
}

/** Window (seconds) before a detected word onset searched for a quiet cut point. */
const PAGE_SLICE_SNAP_WINDOW_SEC = 0.12
/** Edge fade (ms) applied to each per-entry slice to prevent boundary clicks. */
const PAGE_SLICE_FADE_MS = 8

// ---------------------------------------------------------------------------
// Word timestamp generation (Whisper) with cache
// ---------------------------------------------------------------------------

export interface GenerateWordTimestampsOptions {
  audioBuffer: Buffer
  fileName: string
  apiKey: string
  language?: string
  prompt?: string
  cacheDir: string
}

export interface GenerateWordTimestampsResult extends WhisperTranscriptionResult {
  cached: boolean
}

/**
 * Transcribe an audio file with Whisper word-level timestamps, cached on
 * audio content + language + prompt so re-runs after a TTS cache hit are instant.
 */
export async function generateWordTimestamps(
  options: GenerateWordTimestampsOptions,
): Promise<GenerateWordTimestampsResult> {
  const { audioBuffer, fileName, apiKey, language, prompt, cacheDir } = options

  const audioHash = crypto.createHash("sha256").update(audioBuffer).digest("hex")
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ audioHash, language: language ?? "", prompt: prompt ?? "", model: "whisper-1" }))
    .digest("hex")

  const cacheRoot = path.resolve(cacheDir, "word-timestamps")
  const cachePath = path.resolve(cacheRoot, `${hash}.json`)
  assertWithinBase(cacheRoot, cachePath, "cache file")

  if (fs.existsSync(cachePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as WhisperTranscriptionResult
      return { ...parsed, cached: true }
    } catch {
      // Fall through to regenerate on parse failure
    }
  }

  const result = await transcribeWithWhisper(audioBuffer, fileName, apiKey, language, prompt)

  fs.mkdirSync(cacheRoot, { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2) + "\n")

  return { ...result, cached: false }
}
