import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import yaml from "js-yaml"
import type { SpeechFileEntry, TTSProviderConfig } from "@adt/types"
import type { TTSSynthesizer } from "@adt/llm"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"

// ---------------------------------------------------------------------------
// Emoji stripping
// ---------------------------------------------------------------------------

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]/gu
const SAFE_TEXT_ID_RE = /^[A-Za-z0-9._-]+$/
const SAFE_LANGUAGE_RE = /^[A-Za-z0-9_-]+$/
const SAFE_FORMAT_RE = /^[a-z0-9]+$/

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
  voiceMaps: VoiceMaps
): string {
  const providerConfig = voiceMaps[provider]
  if (!providerConfig) return "alloy"

  const normalized = normalizeLocale(languageCode).toLowerCase()

  // Exact match (e.g. "es-uy")
  if (normalized in providerConfig) return providerConfig[normalized]

  // Base language (e.g. "es" from "es-uy")
  const baseLang = getBaseLanguage(normalized)
  if (baseLang in providerConfig) return providerConfig[baseLang]

  // Default
  return providerConfig["default"] ?? "alloy"
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

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function computeSpeechHash(data: {
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
  provider?: string
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
    provider,
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

  const hash = computeSpeechHash({
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
  const audioBytes = await ttsSynthesizer.synthesize({
    model,
    voice,
    input: sanitized,
    responseFormat: safeFormat,
    instructions: instructions || undefined,
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
