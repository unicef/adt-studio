import { getBaseLanguage, normalizeLocale } from "./languages"

interface RoutingProviderConfig {
  languages?: string[]
}

export interface SpeechProviderCredentials {
  openaiKey?: string
  azureKey?: string
  azureRegion?: string
  geminiKey?: string
}

export function hasSpeechProviderCredentials(
  provider: string,
  credentials: SpeechProviderCredentials,
): boolean {
  if (provider === "azure") {
    return Boolean(credentials.azureKey?.trim() && credentials.azureRegion?.trim())
  }
  if (provider === "gemini") return Boolean(credentials.geminiKey?.trim())
  if (provider === "openai") return Boolean(credentials.openaiKey?.trim())
  return false
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

export function languageUsesSpeechProvider(
  languageCode: string,
  providerName: string,
  speechConfig: unknown
): boolean {
  return resolveSpeechProviderForLanguage(languageCode, speechConfig) === providerName
}
