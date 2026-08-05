import { z } from "zod"
import { TextCatalogCategory, getTextCatalogCategory } from "./text-catalog.js"

export const TTSRateLimitConfig = z.object({
  /**
   * Requests per minute for this provider. `"auto"` (the default when omitted)
   * starts at the documented ceiling for the selected model and adaptively
   * backs off when the account gets rate-limited, then probes back up. A number
   * pins the starting ceiling instead (still backs off on 429s).
   */
  requests_per_minute: z
    .union([z.literal("auto"), z.number().int().min(1)])
    .optional(),
  /** Floor the adaptive limiter may drop to under sustained throttling. */
  min_requests_per_minute: z.number().int().min(1).optional(),
  /** Ceiling the adaptive limiter may recover to (overrides the per-model default). */
  max_requests_per_minute: z.number().int().min(1).optional(),
})
export type TTSRateLimitConfig = z.infer<typeof TTSRateLimitConfig>

export const TTSProviderConfig = z.object({
  model: z.string().optional(),
  languages: z.array(z.string()).optional(),
  /**
   * Adaptive RPM limiter config — currently only read for the `gemini`
   * provider (see `resolveGeminiTtsRateLimit`/`stage-runner.ts`). It parses
   * fine under `providers.elevenlabs`/`providers.azure`/`providers.openai`
   * too but is silently ignored there: ElevenLabs is throttled by a fixed
   * internal concurrency cap instead (its plans limit concurrent
   * connections, not requests/minute), and Azure/OpenAI have no adaptive
   * limiter at all.
   */
  rate_limit: TTSRateLimitConfig.optional(),
})
export type TTSProviderConfig = z.infer<typeof TTSProviderConfig>

export const SpeechConfig = z.object({
  model: z.string().optional(),
  format: z.string().optional(),
  voice: z.string().optional(),
  voices_config: z.string().optional(),
  instructions_config: z.string().optional(),
  word_highlighting: z.boolean().optional(),
  default_provider: z.string().optional(),
  providers: z.record(z.string(), TTSProviderConfig).optional(),
  bit_rate: z.string().optional(),
  sample_rate: z.number().optional(),
  /**
   * Gemini TTS sampling controls. Each sentence is synthesized in its own
   * stateless request, so the model re-derives prosody every call and the tone
   * can drift between sentences. A low temperature reduces that variance and a
   * fixed seed makes delivery reproducible — together they keep the voice
   * consistent across sentences. Ignored by OpenAI/Azure (their APIs have no
   * such parameter). When unset, neither is sent and Gemini uses its own
   * defaults — i.e. sampling control is disabled.
   */
  temperature: z.number().min(0).max(2).optional(),
  seed: z.number().int().optional(),
  /**
   * ElevenLabs-only TTS tuning. Ignored by OpenAI/Azure/Gemini (their APIs
   * have no equivalent parameters). `elevenlabs_use_context` sends the
   * adjacent catalog entry's text as ElevenLabs' `previous_text`/`next_text`
   * so tone flows across entry boundaries instead of each entry sounding like
   * an isolated, stateless request. `elevenlabs_apply_text_normalization`
   * controls whether ElevenLabs expands things like numbers/dates/
   * abbreviations before synthesis ("auto" lets ElevenLabs decide, "on"
   * forces it — slower but safer for odd formatting, "off" disables it —
   * required for some languages/models). When unset, neither is sent and
   * ElevenLabs uses its own defaults.
   */
  elevenlabs_use_context: z.boolean().optional(),
  elevenlabs_apply_text_normalization: z.enum(["auto", "on", "off"]).optional(),
  /**
   * ElevenLabs `voice_settings` overrides. ElevenLabs applies the *voice's own
   * stored dashboard settings* whenever `voice_settings` is omitted from the
   * request, which for community/cloned voices can mean a low `stability` or a
   * non-zero `style` — and ElevenLabs documents that those cause "inconsistent
   * speed, mispronunciation and the addition of extra sounds", i.e. filler
   * sounds like "ehm" that aren't in the source text. So we always send a
   * resolved `voice_settings` block (see `DEFAULT_ELEVENLABS_VOICE_SETTINGS`)
   * and these fields override individual values.
   *
   * `elevenlabs_speed` has no default: it is only sent when explicitly set, so
   * an unset value leaves ElevenLabs' own pacing untouched.
   */
  elevenlabs_stability: z.number().min(0).max(1).optional(),
  elevenlabs_similarity_boost: z.number().min(0).max(1).optional(),
  elevenlabs_style: z.number().min(0).max(1).optional(),
  elevenlabs_use_speaker_boost: z.boolean().optional(),
  elevenlabs_speed: z.number().min(0.7).max(1.2).optional(),
  /**
   * Experimental (Gemini only): synthesize a whole page's text in ONE request
   * so tone stays consistent across sentences, then slice the page audio back
   * into per-entry files using a Whisper alignment pass. Requires an OpenAI key
   * (for Whisper). Non-page entries (glossary, quiz, easy-read) and non-Gemini
   * languages keep the per-entry path.
   */
  batch_by_page: z.boolean().optional(),
  /** Text categories excluded from read-aloud (no audio generated or packaged) */
  excluded_categories: z.array(TextCatalogCategory).optional(),
  /** Individual text ids excluded from read-aloud; also mutes their `_easy_read` variants */
  excluded_text_ids: z.array(z.string()).optional(),
})
export type SpeechConfig = z.infer<typeof SpeechConfig>

export function isSpeechWordHighlightingEnabled(
  config?: Pick<SpeechConfig, "word_highlighting"> | null,
): boolean {
  return config?.word_highlighting === true
}

/** Accepts plain string arrays so callers can pass unvalidated config data;
 * unknown category values simply never match. */
export interface TtsExclusionConfig {
  excluded_categories?: string[]
  excluded_text_ids?: string[]
}

const EASY_READ_SUFFIX_RE = /_easy_read$/

/**
 * Whether a text catalog entry is excluded from read-aloud, either by its
 * category or individually by id. An `{id}_easy_read` variant inherits the
 * exclusion of its source entry, so muting an element silences both its
 * regular and Easy Read audio.
 */
export function isTtsExcluded(
  textId: string,
  config?: TtsExclusionConfig | null,
): boolean {
  if (!config) return false
  const baseId = textId.replace(EASY_READ_SUFFIX_RE, "")
  if (config.excluded_text_ids?.some((id) => id === textId || id === baseId)) {
    return true
  }
  const categories = config.excluded_categories
  if (!categories || categories.length === 0) return false
  if (categories.includes(getTextCatalogCategory(textId))) return true
  return baseId !== textId && categories.includes(getTextCatalogCategory(baseId))
}

export const SpeechFileEntry = z.object({
  textId: z.string(),
  language: z.string(),
  fileName: z.string(),
  voice: z.string(),
  model: z.string(),
  cached: z.boolean(),
  provider: z.string().optional(),
})
export type SpeechFileEntry = z.infer<typeof SpeechFileEntry>

/** A catalog entry whose speech generation failed during the last run. */
export const SpeechFailedEntry = z.object({
  textId: z.string(),
  error: z.string(),
})
export type SpeechFailedEntry = z.infer<typeof SpeechFailedEntry>

export const TTSOutput = z.object({
  entries: z.array(SpeechFileEntry),
  generatedAt: z.string(),
  /** Per-item failures from the run that produced this output, so the UI can
   * mark them without re-running. Cleared by the next successful run. */
  failed: z.array(SpeechFailedEntry).optional(),
})
export type TTSOutput = z.infer<typeof TTSOutput>

export const WordTimestamp = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
})
export type WordTimestamp = z.infer<typeof WordTimestamp>

export const WordTimestampEntry = z.object({
  textId: z.string(),
  language: z.string(),
  words: z.array(WordTimestamp),
  duration: z.number(),
})
export type WordTimestampEntry = z.infer<typeof WordTimestampEntry>

export const WordTimestampOutput = z.object({
  entries: z.record(z.string(), WordTimestampEntry),
  generatedAt: z.string(),
  /** Per-item word-timestamp failures from the run that produced this output,
   * so the Speech view can mark them for pruning or one-by-one regeneration
   * (mirrors {@link TTSOutput.failed}). Cleared for an item on a successful
   * re-transcription and reset by the next full speech run. */
  failed: z.array(SpeechFailedEntry).optional(),
})
export type WordTimestampOutput = z.infer<typeof WordTimestampOutput>
