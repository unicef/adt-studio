import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import yaml from "js-yaml"
import {
  DEFAULT_OPENAI_TTS_MODEL_ID,
  DEFAULT_ELEVENLABS_TTS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  isTtsExcluded,
  type SpeechConfig,
  type SpeechFileEntry,
  type TTSProviderConfig,
  type TTSRateLimitConfig,
  type TextCatalogEntry,
} from "@adt/types"
import type {
  ElevenLabsVoiceSettingsOverrides,
  LlmLogEntry,
  RateLimiter,
  TTSSynthesizer,
  WhisperTranscriptionResult,
} from "@adt/llm"
import {
  buildElevenLabsOutputFormat,
  resolveElevenLabsVoiceSettings,
  transcribeWithWhisper,
} from "@adt/llm"
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

/**
 * Build the common debug-log record for a TTS request. Keeping this next to
 * the generation helpers prevents the API runner, the one-item route, and the
 * CLI/DAG executor from drifting in their representation of the same call.
 */
export function buildTtsLogEntry(options: {
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
  params?: Record<string, unknown>
}): LlmLogEntry {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    taskType: "tts",
    pageId: options.textId,
    promptName: `tts-${options.provider}`,
    modelId: `${options.provider}/${options.model}`,
    cacheHit: options.cached,
    success: options.success,
    errorCount: options.success ? 0 : 1,
    attempt: Math.max(options.attempt, 1),
    durationMs: options.durationMs,
    ...(options.error ? { error: options.error } : {}),
    ...(options.params ? { params: options.params } : {}),
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: `[${options.language}] voice=${options.voice}\n${options.text}`,
      }],
    }],
  }
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
  const usesGenericDefault = !normalizedDefaultVoice || normalizedDefaultVoice === DEFAULT_OPENAI_VOICE
  const fallback =
    provider === "gemini" && usesGenericDefault
      ? DEFAULT_GEMINI_VOICE
      : provider === "elevenlabs" && usesGenericDefault
        ? DEFAULT_ELEVENLABS_VOICE_ID
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
  if (provider === "elevenlabs") return DEFAULT_ELEVENLABS_TTS_MODEL_ID
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
// ElevenLabs throttling + retry policy
// ---------------------------------------------------------------------------

// ElevenLabs has no adaptive limiter (its throttling is concurrency-based, not
// RPM-based) so we bound pressure two ways: cap how many entries synthesize in
// parallel, and retry 429/5xx with exponential backoff so a transient
// concurrency-limit hit doesn't fail the entry outright. The cap matches the
// low, plan-dependent concurrent-request ceilings (Free ~4, Starter ~5).
//
// Lives here rather than in the API service so the CLI/`runFullPipeline` DAG
// executor gets the same protection — its default concurrency is 32, far above
// any ElevenLabs plan ceiling.
export const ELEVENLABS_TTS_MAX_CONCURRENCY = 4
export const ELEVENLABS_TTS_MAX_RATE_LIMIT_RETRIES = 5
export const ELEVENLABS_TTS_BASE_RETRY_DELAY_MS = 2_000
export const ELEVENLABS_TTS_MAX_RETRY_DELAY_MS = 30_000

/** HTTP status embedded in a `createElevenLabsTTSSynthesizer` error message,
 *  which always formats failures as `... failed (<status>): <body>`. */
export function parseElevenLabsErrorStatus(message: string): number | null {
  const match = /\((\d{3})\)/.exec(message)
  return match ? Number(match[1]) : null
}

// Transport-level failures never reach an HTTP status, so they're matched by
// name. Kept deliberately narrow: these are node/undici network errors, not
// free-text from an upstream response body.
const ELEVENLABS_NETWORK_ERROR_RE =
  /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|network|aborted due to timeout/i

export type ElevenLabsTtsErrorKind = "rate-limit" | "transient" | "permanent"

/**
 * Whether an ElevenLabs TTS failure is worth retrying.
 *
 * Keyed on the HTTP status rather than the response body. Matching free text
 * (e.g. `/try again/i`) misclassifies permanent 4xx responses whose body
 * happens to contain those words, burning five backoff waits — up to ~60s —
 * per entry on a request that will never succeed.
 */
export function classifyElevenLabsTtsError(message: string): ElevenLabsTtsErrorKind {
  const status = parseElevenLabsErrorStatus(message)
  if (status === 429) return "rate-limit"
  if (status !== null) return status >= 500 && status <= 599 ? "transient" : "permanent"
  // No status → never reached the API. Retry genuine transport errors only.
  return ELEVENLABS_NETWORK_ERROR_RE.test(message) ? "transient" : "permanent"
}

/** Exponential backoff for retry attempt `attemptCount` (1-based). */
export function elevenLabsTtsRetryDelayMs(attemptCount: number): number {
  return Math.min(
    ELEVENLABS_TTS_BASE_RETRY_DELAY_MS * 2 ** (attemptCount - 1),
    ELEVENLABS_TTS_MAX_RETRY_DELAY_MS
  )
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
  /** ElevenLabs continuity + normalization params for this item (from
   *  SpeechConfig). Only folded into the key for the elevenlabs provider —
   *  changing adjacent text or the normalization mode regenerates audio, but
   *  these must not affect the key for other providers. */
  elevenLabsPreviousText?: string
  elevenLabsNextText?: string
  elevenLabsApplyTextNormalization?: "auto" | "on" | "off"
} & ElevenLabsVoiceSettingsOverrides): string {
  // Gemini output also depends on any sampling params it's sent (temperature +
  // seed), so fold in whichever are set — tuning them regenerates Gemini audio,
  // and clearing them (disabling) also produces a distinct key. Gated on
  // provider so OpenAI/Azure keys are unaffected; a Gemini item with neither
  // set hashes identically to a request that sends no sampling params. Both
  // callers (generateSpeechFile and the stage-runner reuse check) pass
  // `provider`, so they stay in sync automatically.
  const {
    geminiTemperature,
    geminiSeed,
    elevenLabsPreviousText,
    elevenLabsNextText,
    elevenLabsApplyTextNormalization,
    elevenLabsStability,
    elevenLabsSimilarityBoost,
    elevenLabsStyle,
    elevenLabsUseSpeakerBoost,
    elevenLabsSpeed,
    ...base
  } = data
  const gemini =
    base.provider === "gemini"
      ? {
          ...(geminiTemperature !== undefined ? { geminiTemperature } : {}),
          ...(geminiSeed !== undefined ? { geminiSeed } : {}),
        }
      : {}
  // Same gating for ElevenLabs: adjacent-text context and the normalization
  // mode are only sent (and thus only affect the audio) for that provider.
  //
  // `voice_settings` is different from every other field here: the request
  // ALWAYS carries a resolved block, so the key must hash the *effective*
  // values rather than only the user's overrides. Hashing just the overrides
  // would make a future change to DEFAULT_ELEVENLABS_VOICE_SETTINGS reuse
  // audio generated under the old defaults. `resolveElevenLabsVoiceSettings`
  // is the same function the synthesizer uses to build the body, so the two
  // cannot drift.
  const elevenlabs =
    base.provider === "elevenlabs"
      ? {
          ...(elevenLabsPreviousText ? { elevenLabsPreviousText } : {}),
          ...(elevenLabsNextText ? { elevenLabsNextText } : {}),
          ...(elevenLabsApplyTextNormalization
            ? { elevenLabsApplyTextNormalization }
            : {}),
          elevenLabsVoiceSettings: resolveElevenLabsVoiceSettings({
            elevenLabsStability,
            elevenLabsSimilarityBoost,
            elevenLabsStyle,
            elevenLabsUseSpeakerBoost,
            elevenLabsSpeed,
          }),
        }
      : {}
  const json = JSON.stringify({ ...base, ...gemini, ...elevenlabs })
  return crypto.createHash("sha256").update(json).digest("hex")
}

/**
 * Map the `elevenlabs_*` voice-tuning fields of a book's `SpeechConfig` onto
 * the camelCase option names used by `generateSpeechFile` and
 * `computeSpeechCacheKey`.
 *
 * Exists so the three execution paths (API stage-runner, CLI/`runFullPipeline`
 * DAG, single-item regeneration route) each spread one call instead of
 * restating five fields — the previous per-field duplication is exactly how
 * those paths drifted out of sync before, producing different cache keys for
 * the same audio.
 */
export function elevenLabsVoiceSettingsFromConfig(
  speech?: Pick<
    SpeechConfig,
    | "elevenlabs_stability"
    | "elevenlabs_similarity_boost"
    | "elevenlabs_style"
    | "elevenlabs_use_speaker_boost"
    | "elevenlabs_speed"
  > | null,
): ElevenLabsVoiceSettingsOverrides {
  return {
    elevenLabsStability: speech?.elevenlabs_stability,
    elevenLabsSimilarityBoost: speech?.elevenlabs_similarity_boost,
    elevenLabsStyle: speech?.elevenlabs_style,
    elevenLabsUseSpeakerBoost: speech?.elevenlabs_use_speaker_boost,
    elevenLabsSpeed: speech?.elevenlabs_speed,
  }
}

/**
 * The ElevenLabs `output_format` for a logged request.
 *
 * `buildElevenLabsOutputFormat` throws for a format ElevenLabs cannot produce.
 * On the success path that can't happen (synthesis would have thrown first), but
 * the failure path logs the request that just failed — and an unsupported format
 * is one reason it may have failed. Falling back to the generic format keeps the
 * log write from throwing inside an error handler and losing the entry.
 */
function resolveElevenLabsLoggedOutputFormat(input: {
  format: string
  sampleRate?: number
  bitRate?: string
}): string {
  try {
    return buildElevenLabsOutputFormat(input.format, {
      sampleRate: input.sampleRate,
      bitRate: input.bitRate,
    })
  } catch {
    return input.format
  }
}

/**
 * The ElevenLabs request parameters to record on a TTS debug log entry, so a
 * user can answer "which settings produced this audio file?".
 *
 * Two deliberate choices:
 *
 * 1. The `voice_settings` reported are the *effective* ones — defaults merged
 *    with the book's overrides via `resolveElevenLabsVoiceSettings`, the same
 *    function that builds the request body. A book that configures nothing still
 *    shows stability 0.7, and the log cannot drift from what was actually sent.
 * 2. Adjacent-text context is reported as presence + length, not the text
 *    itself. Whether context was sent is the useful fact; the neighbouring
 *    sentences would only bloat every log row.
 * 3. `outputFormat` is the ElevenLabs *wire* value (`mp3_44100_128`), not the
 *    generic `speech.format` (`mp3`). ElevenLabs only accepts a fixed set of
 *    (sample rate, bitrate) combinations, so a configured `sample_rate` /
 *    `bit_rate` gets snapped to the nearest supported one — and this log line is
 *    the only place that snapping is visible. Reporting the generic format
 *    instead would just echo the config back.
 *
 * Key order is meaningful: the debug panel renders these in insertion order, so
 * related settings stay adjacent.
 */
export function buildElevenLabsTtsLogParams(
  input: {
    model: string
    voice: string
    language: string
    /** Generic `speech.format` (mp3/wav/pcm/opus), snapped to a wire value below. */
    format: string
    sampleRate?: number
    bitRate?: string
    applyTextNormalization?: "auto" | "on" | "off"
    previousText?: string
    nextText?: string
  } & ElevenLabsVoiceSettingsOverrides,
): Record<string, unknown> {
  const voiceSettings = resolveElevenLabsVoiceSettings(input)
  return {
    voice: input.voice,
    model: input.model,
    language: input.language,
    outputFormat: resolveElevenLabsLoggedOutputFormat(input),
    stability: voiceSettings.stability,
    similarityBoost: voiceSettings.similarity_boost,
    style: voiceSettings.style,
    useSpeakerBoost: voiceSettings.use_speaker_boost,
    // Absent unless the book pinned a speed — matches the request body, where
    // an unset speed leaves ElevenLabs' own pacing alone.
    ...(voiceSettings.speed !== undefined ? { speed: voiceSettings.speed } : {}),
    // Absent when unset, mirroring the request: ElevenLabs applies its own
    // default rather than a value we chose.
    ...(input.applyTextNormalization
      ? { applyTextNormalization: input.applyTextNormalization }
      : {}),
    contextBefore: Boolean(input.previousText),
    contextAfter: Boolean(input.nextText),
    ...(input.previousText ? { contextBeforeChars: input.previousText.length } : {}),
    ...(input.nextText ? { contextAfterChars: input.nextText.length } : {}),
  }
}

const EASY_READ_ID_RE = /_easy_read$/

/**
 * Nearest non-excluded neighbor's text in reading order, used to build
 * ElevenLabs' previous_text/next_text (elevenlabs_use_context). Skips
 * TTS-excluded entries so context still flows across them instead of citing
 * text that has no audio of its own. Shared by the API's stage-runner and the
 * CLI/`runFullPipeline` DAG executor so both resolve identical adjacent text
 * for the same entry — keeping `computeSpeechCacheKey` in sync across paths.
 *
 * Two constraints beyond "pick the neighbour":
 *
 * 1. The text is emoji-stripped and screened with `isSpeakableText`, exactly
 *    like the entry's own `text` is before synthesis. Sending emoji only in the
 *    context fields would ask ElevenLabs to reason about characters it never has
 *    to speak; screening for speakability skips neighbours that are pure
 *    punctuation ("…", "—"), which `generateSpeechFile` never synthesizes and
 *    which carry no intonation to borrow — they would only sit in the cache key.
 * 2. The search stays inside the current entry's variant group. For the source
 *    language the stage-runner appends the Easy Read variants to the entry
 *    array (`[...catalog.entries, ...sourceEasyReadEntries]`), so a plain
 *    neighbour scan makes the last main-catalog entry's `next_text` an Easy
 *    Read rewrite of much earlier content — worse than no context at all.
 */
export function findAdjacentSpeechText(
  entries: TextCatalogEntry[],
  index: number,
  direction: 1 | -1,
  speechConfig: Parameters<typeof isTtsExcluded>[1],
): string | undefined {
  const wantEasyRead = EASY_READ_ID_RE.test(entries[index]?.id ?? "")
  for (let i = index + direction; i >= 0 && i < entries.length; i += direction) {
    const entry = entries[i]
    if (EASY_READ_ID_RE.test(entry.id) !== wantEasyRead) continue
    if (isTtsExcluded(entry.id, speechConfig)) continue
    const text = stripEmojis(entry.text).trim()
    if (isSpeakableText(text)) return text
  }
  return undefined
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

export interface GenerateSpeechFileOptions extends ElevenLabsVoiceSettingsOverrides {
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
  /** ElevenLabs continuity + normalization params (SpeechConfig
   *  elevenlabs_use_context/elevenlabs_apply_text_normalization). Passed to
   *  the synthesizer and folded into the cache key for the elevenlabs
   *  provider only. `previousText`/`nextText` are the caller-resolved
   *  adjacent catalog entries' text (only set when elevenlabs_use_context is
   *  enabled); undefined → not sent, ElevenLabs uses its own defaults. */
  elevenLabsPreviousText?: string
  elevenLabsNextText?: string
  elevenLabsApplyTextNormalization?: "auto" | "on" | "off"
  /** ElevenLabs `voice_settings` overrides, via
   *  {@link ElevenLabsVoiceSettingsOverrides}. Build these with
   *  {@link elevenLabsVoiceSettingsFromConfig} so every execution path derives
   *  the same values — and therefore the same cache key. */
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
    elevenLabsPreviousText,
    elevenLabsNextText,
    elevenLabsApplyTextNormalization,
    elevenLabsStability,
    elevenLabsSimilarityBoost,
    elevenLabsStyle,
    elevenLabsUseSpeakerBoost,
    elevenLabsSpeed,
    signal,
  } = options

  // One object shared by the cache key and the synthesize() call below, so the
  // hashed settings can never diverge from the settings actually sent.
  const elevenLabsVoiceSettings: ElevenLabsVoiceSettingsOverrides = {
    elevenLabsStability,
    elevenLabsSimilarityBoost,
    elevenLabsStyle,
    elevenLabsUseSpeakerBoost,
    elevenLabsSpeed,
  }

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
    elevenLabsPreviousText,
    elevenLabsNextText,
    elevenLabsApplyTextNormalization,
    ...elevenLabsVoiceSettings,
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
    elevenLabsPreviousText,
    elevenLabsNextText,
    elevenLabsApplyTextNormalization,
    ...elevenLabsVoiceSettings,
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
