import { getBaseLanguage, normalizeLocale } from "./languages"

interface RoutingProviderConfig {
  languages?: string[]
}

function parseProviders(
  speechConfig: unknown
): Record<string, RoutingProviderConfig> {
  if (!speechConfig || typeof speechConfig !== "object") {
    return {}
  }

  const providers = (speechConfig as Record<string, unknown>).providers
  if (!providers || typeof providers !== "object") {
    return {}
  }

  const result: Record<string, RoutingProviderConfig> = {}
  for (const [provider, value] of Object.entries(
    providers as Record<string, unknown>
  )) {
    if (!value || typeof value !== "object") continue
    const configuredLanguages = (value as Record<string, unknown>).languages
    const languages = Array.isArray(configuredLanguages)
      ? configuredLanguages
          .filter((language: unknown): language is string => typeof language === "string")
          .map((language) => normalizeLocale(language))
      : undefined
    result[provider] = { languages }
  }
  return result
}

export function resolveSpeechProviderForLanguage(
  languageCode: string,
  speechConfig: unknown
): string {
  const normalizedLanguage = normalizeLocale(languageCode)
  const baseLanguage = getBaseLanguage(normalizedLanguage)

  const defaultProvider =
    speechConfig &&
      typeof speechConfig === "object" &&
      typeof (speechConfig as Record<string, unknown>).default_provider === "string"
      ? String((speechConfig as Record<string, unknown>).default_provider)
      : "openai"

  const providers = parseProviders(speechConfig)
  for (const [providerName, config] of Object.entries(providers)) {
    const languages = config.languages ?? []
    if (
      languages.includes(normalizedLanguage) ||
      languages.includes(baseLanguage)
    ) {
      return providerName
    }
  }

  return defaultProvider
}

/** Providers configured for the requested book languages. Availability allows
 * entering a run when any configured narrator is available; the server still
 * validates credentials for the actual selected work. */
export function speechProvidersForLanguages(languages: string[], speechConfig: unknown): string[] {
  const providers = new Set(languages.map(language => resolveSpeechProviderForLanguage(language, speechConfig)))
  const activeLanguages = new Set(languages.map(language => normalizeLocale(language).toLowerCase()))
  const secondary = speechConfig && typeof speechConfig === "object"
    ? (speechConfig as Record<string, unknown>).secondary_voices : undefined
  if (secondary && typeof secondary === "object") {
    for (const [language, value] of Object.entries(secondary)) {
      if (!activeLanguages.has(normalizeLocale(language).toLowerCase()) || !value || typeof value !== "object") continue
      const voice = value as Record<string, unknown>
      if (typeof voice.provider === "string" && typeof voice.voice === "string" && voice.voice.trim()) providers.add(voice.provider)
    }
  }
  return [...providers]
}

/** Speech providers a book's run narrates with: its editing language (the
 * configured one, else the book's own, else English) plus every output
 * language, routed through `speechProvidersForLanguages`. The one rule for
 * "can this book synthesize" — callers check any of them is available. */
export function bookSpeechProviders(
  mergedConfig: Record<string, unknown> | undefined,
  bookLanguage: string | null | undefined,
): string[] {
  const outputs = Array.isArray(mergedConfig?.output_languages)
    ? mergedConfig.output_languages.filter((code): code is string => typeof code === "string")
    : []
  const editingLanguage = typeof mergedConfig?.editing_language === "string"
    ? mergedConfig.editing_language
    : bookLanguage ?? "en"
  return speechProvidersForLanguages(
    [editingLanguage, ...new Set(outputs.map((code) => normalizeLocale(code)))],
    mergedConfig?.speech,
  )
}

export function languageUsesSpeechProvider(
  languageCode: string,
  providerName: string,
  speechConfig: unknown
): boolean {
  return resolveSpeechProviderForLanguage(languageCode, speechConfig) === providerName
}

/** Which entry of a locale-keyed map supplied the resolved value. */
export type LocaleMappingSource = "locale" | "base-language" | "default" | "none"

export interface LocaleMappingResult {
  /** Empty string when nothing matched (`source: "none"`). */
  value: string
  source: LocaleMappingSource
}

/**
 * Resolve a per-language value from a locale-keyed map (`voices.yaml`,
 * `speech_instructions.yaml`), mirroring `resolveVoice`/`resolveInstructions` in
 * `@adt/pipeline`: exact locale → base language → `default`.
 *
 * Two details the previous inline lookups got wrong, both of which made the
 * Speech settings screen display a voice and accent prompt the pipeline would
 * never actually use:
 *
 * 1. **The key is lowercased.** Those YAML files use lowercase locale keys
 *    (`es-uy`, `pt-br`, `en-tz`), while the UI carries `normalizeLocale` output
 *    with an uppercase region (`es-UY`). A case-sensitive lookup therefore missed
 *    every regional mapping. The pipeline lowercases before looking up.
 * 2. **Base language is a fallback.** `es-AR` with only an `es` mapping resolves
 *    to `es`, not to `default`.
 *
 * `source` is returned because callers need to distinguish "this language has a
 * mapping of its own" from "this fell through to the global default" — the same
 * value can mean either.
 */
export function resolveLocaleMapping(
  map: Record<string, string> | undefined,
  languageCode: string
): LocaleMappingResult {
  if (!map) return { value: "", source: "none" }

  const normalized = normalizeLocale(languageCode).toLowerCase()
  if (Object.hasOwn(map, normalized)) {
    return { value: map[normalized], source: "locale" }
  }

  const baseLanguage = getBaseLanguage(normalized)
  if (Object.hasOwn(map, baseLanguage)) {
    return { value: map[baseLanguage], source: "base-language" }
  }

  if (Object.hasOwn(map, "default")) {
    return { value: map["default"], source: "default" }
  }

  return { value: "", source: "none" }
}
