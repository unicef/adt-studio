// Type declarations for the dependency-free regenerator script so it can be
// imported (helpers only) from TypeScript tests. The runtime source of truth is
// regenerate-tts.mjs; its main() is guarded so importing it does not execute.

export function computeSpeechCacheKey(data: {
  text: string
  voice: string
  model: string
  instructions: string
  provider?: string
  geminiTemperature?: number
  geminiSeed?: number
}): string

export function stripEmojis(text: string): string

export function normalizeRegenSpeechText(text: string): string

export function isSpeakableText(text: string): boolean

export function getTextCatalogCategory(id: string): string

export function isTtsExcluded(
  textId: string,
  exclude?: { categories?: string[]; textIds?: string[] } | null,
): boolean

export function main(): Promise<void>
