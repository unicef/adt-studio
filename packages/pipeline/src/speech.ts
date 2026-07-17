import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import yaml from "js-yaml"
import type { SpeechFileEntry, TTSProviderConfig, TTSRateLimitConfig } from "@adt/types"
import type { RateLimiter, TTSSynthesizer, WhisperTranscriptionResult } from "@adt/llm"
import { transcribeWithWhisper } from "@adt/llm"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"

// ---------------------------------------------------------------------------
// Emoji stripping
// ---------------------------------------------------------------------------

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]/gu
const SAFE_TEXT_ID_RE = /^[A-Za-z0-9._-]+$/
const SAFE_LANGUAGE_RE = /^[A-Za-z0-9_-]+$/
const SAFE_FORMAT_RE = /^[a-z0-9]+$/
const DEFAULT_OPENAI_VOICE = "alloy"
const DEFAULT_GEMINI_VOICE = "Kore"
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-tts"
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
  return defaultModel?.trim() || DEFAULT_OPENAI_MODEL
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
}): string {
  const json = JSON.stringify(data)
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
