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
})
export type WordTimestampOutput = z.infer<typeof WordTimestampOutput>
