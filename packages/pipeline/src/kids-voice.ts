/**
 * Kids Mode buddy voice pack generation.
 *
 * Walks the shared speakable-line registry (`@adt/types/kids`) for each
 * packed buddy × each requested language, synthesizes clips through the
 * shared TTS synthesizer, and writes them plus a per-language manifest into
 * the book directory:
 *
 *   <bookDir>/kids-voice/<lang>/manifest.json
 *   <bookDir>/kids-voice/<lang>/<character>/<line-key>.<format>
 *
 * `package-web` copies this folder into the packaged book as
 * `content/kids-voice/`, where the runtime's buddy-voice player reads it.
 *
 * Clips share the book's TTS cache (same key scheme as read-aloud speech:
 * hash of text + voice + model + instructions + provider), so re-runs and
 * re-packs only pay for lines whose text or voice actually changed.
 */
import fs from "node:fs"
import path from "node:path"
import {
  KIDS_LANGUAGE_NAMES,
  KIDS_NARRATOR_ID,
  KIDS_VOICE_MANIFEST_VERSION,
  getKidsBuddyMeta,
  getKidsNarratorLines,
  getKidsSpeakableLines,
  resolveKidsBuddyVoice,
  type KidsBuddyVoiceConfig,
  type KidsVoiceManifest,
} from "@adt/types"
import type { TTSSynthesizer } from "@adt/llm"
import {
  computeSpeechCacheKey,
  isSpeakableText,
  stripEmojis,
} from "./speech.js"

const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/

/**
 * Kids voice clips are book-independent (same lines, voices, and languages
 * everywhere), so they cache globally — one generation pays for every book.
 * Mirrors the Google Fonts cache pattern (`FONTS_CACHE_DIR`).
 */
export function resolveKidsVoiceCacheDir(booksDir: string): string {
  return (
    process.env.KIDS_VOICE_CACHE_DIR ||
    path.join(path.resolve(booksDir), ".kids-voice-cache")
  )
}

export interface KidsVoiceClipPlan {
  language: string
  character: string
  lineKey: string
  text: string
  fileName: string
  cached: boolean
}

export interface KidsVoiceGenerationResult {
  clips: KidsVoiceClipPlan[]
  total: number
  cachedHits: number
  generated: number
  dryRun: boolean
}

export interface GenerateKidsVoicePackOptions {
  bookDir: string
  cacheDir: string
  /**
   * Older cache locations checked on a primary-cache miss (e.g. the legacy
   * per-book `.cache`). Hits are promoted into `cacheDir` so the migration
   * is one-way and free.
   */
  fallbackCacheDirs?: string[]
  languages: string[]
  characters: string[]
  /** language → merged interface-translation catalog for that language. */
  translationsByLanguage: Record<string, Record<string, string>>
  /**
   * Per-book overrides of a buddy's voice id/instructions, keyed by buddy id.
   * Merged over the shared default per field — an edit changes the TTS
   * cache key, so it intentionally triggers regeneration of that buddy's
   * clips.
   */
  voiceOverrides?: Record<string, Partial<KidsBuddyVoiceConfig>>
  /**
   * Per-language voice for the neutral narrator track (the book's own
   * narration voice, not a buddy). Languages without an entry get no
   * narrator track. Omitting this option entirely disables the narrator
   * track for every language (unchanged behavior).
   */
  narratorVoiceByLanguage?: Record<string, KidsBuddyVoiceConfig>
  ttsSynthesizer: TTSSynthesizer
  model: string
  format?: string
  provider?: string
  /** Plan + cache check only: no synthesis, no files written. */
  dryRun?: boolean
  onClip?: (clip: KidsVoiceClipPlan, index: number, total: number) => void
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(.*?)\}/g, (_, name) => vars[name] ?? "")
}

function assertSafeSegment(value: string, name: string): string {
  if (!SAFE_SEGMENT_RE.test(value)) {
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

/**
 * Resolve the spoken text for one line in one language for one buddy —
 * catalog translation when present, inline English fallback otherwise,
 * with `${name}` / `${language}` interpolation baked in.
 */
export function resolveKidsLineText(options: {
  lineKey: string
  fallback: string
  language: string
  characterId: string
  dict: Record<string, string>
}): string {
  const { lineKey, fallback, language, characterId, dict } = options
  const meta = getKidsBuddyMeta(characterId)
  const buddyName = dict[meta.defaultNameKey] || meta.defaultNameFallback
  const languageName =
    KIDS_LANGUAGE_NAMES[language] ??
    KIDS_LANGUAGE_NAMES[language.toLowerCase()] ??
    language
  const template = dict[lineKey] || fallback
  return interpolate(template, { name: buddyName, language: languageName })
}

/**
 * Reads a language's already-baked voice manifest from disk, if any. Returns a
 * mutable copy so callers can merge new clips into it without touching the
 * on-disk file until the write pass. Version mismatches are ignored (treated as
 * absent) so a stale schema is rebuilt rather than merged into.
 */
function readExistingVoiceManifest(
  voiceRoot: string,
  language: string,
): KidsVoiceManifest | null {
  const manifestPath = path.resolve(voiceRoot, language, "manifest.json")
  if (!fs.existsSync(manifestPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as
      | KidsVoiceManifest
      | undefined
    if (
      !parsed ||
      parsed.version !== KIDS_VOICE_MANIFEST_VERSION ||
      typeof parsed.characters !== "object" ||
      parsed.characters === null
    ) {
      return null
    }
    return { version: parsed.version, characters: { ...parsed.characters } }
  } catch {
    return null
  }
}

export async function generateKidsVoicePack(
  options: GenerateKidsVoicePackOptions,
): Promise<KidsVoiceGenerationResult> {
  const {
    bookDir,
    cacheDir,
    fallbackCacheDirs = [],
    languages,
    characters,
    translationsByLanguage,
    voiceOverrides,
    narratorVoiceByLanguage,
    ttsSynthesizer,
    model,
    format = "mp3",
    provider = "openai",
    dryRun = false,
    onClip,
  } = options

  const safeFormat = assertSafeSegment(format.toLowerCase(), "audio format")
  const voiceRoot = path.resolve(bookDir, "kids-voice")
  const cacheRoot = path.resolve(cacheDir, "tts")

  const clips: KidsVoiceClipPlan[] = []
  const work: Array<{
    language: string
    characterId: string
    lineKey: string
    text: string
    voice: string
    instructions: string
  }> = []

  for (const language of languages) {
    const safeLanguage = assertSafeSegment(language, "language code")
    const dict = translationsByLanguage[safeLanguage] ?? {}
    for (const characterId of characters) {
      const safeCharacter = assertSafeSegment(characterId, "character id")
      const voice = resolveKidsBuddyVoice(safeCharacter, voiceOverrides)
      for (const line of getKidsSpeakableLines(safeCharacter)) {
        const text = stripEmojis(
          resolveKidsLineText({
            lineKey: line.key,
            fallback: line.fallback,
            language: safeLanguage,
            characterId: safeCharacter,
            dict,
          }),
        ).trim()
        if (!isSpeakableText(text)) continue
        work.push({
          language: safeLanguage,
          characterId: safeCharacter,
          lineKey: assertSafeSegment(line.key, "line key"),
          text,
          voice: voice.voice,
          instructions: voice.instructions,
        })
      }
    }

    const narratorVoice = narratorVoiceByLanguage?.[safeLanguage]
    if (narratorVoice) {
      for (const line of getKidsNarratorLines()) {
        const text = stripEmojis(dict[line.key] || line.fallback).trim()
        if (!isSpeakableText(text)) continue
        work.push({
          language: safeLanguage,
          characterId: KIDS_NARRATOR_ID,
          lineKey: assertSafeSegment(line.key, "line key"),
          text,
          voice: narratorVoice.voice,
          instructions: narratorVoice.instructions,
        })
      }
    }
  }

  const manifests = new Map<string, KidsVoiceManifest>()
  let cachedHits = 0
  let generated = 0

  for (const [index, item] of work.entries()) {
    const hash = computeSpeechCacheKey({
      text: item.text,
      voice: item.voice,
      model,
      instructions: item.instructions,
      provider,
    })
    const cachePath = path.resolve(cacheRoot, `${hash}.${safeFormat}`)
    assertWithinBase(cacheRoot, cachePath, "cache file")
    let cached = fs.existsSync(cachePath)
    if (!cached) {
      for (const fallbackDir of fallbackCacheDirs) {
        const fallbackPath = path.resolve(
          fallbackDir,
          "tts",
          `${hash}.${safeFormat}`,
        )
        if (!fs.existsSync(fallbackPath)) continue
        if (!dryRun) {
          fs.mkdirSync(cacheRoot, { recursive: true })
          fs.copyFileSync(fallbackPath, cachePath)
        }
        cached = true
        break
      }
    }

    const fileName = `${item.characterId}/${item.lineKey}.${safeFormat}`
    const clip: KidsVoiceClipPlan = {
      language: item.language,
      character: item.characterId,
      lineKey: item.lineKey,
      text: item.text,
      fileName,
      cached,
    }
    clips.push(clip)
    if (cached) cachedHits += 1

    if (!dryRun) {
      const outputDir = path.resolve(voiceRoot, item.language, item.characterId)
      assertWithinBase(voiceRoot, outputDir, "voice directory")
      const outputPath = path.resolve(outputDir, `${item.lineKey}.${safeFormat}`)
      assertWithinBase(outputDir, outputPath, "voice clip")
      fs.mkdirSync(outputDir, { recursive: true })

      if (cached) {
        fs.copyFileSync(cachePath, outputPath)
      } else {
        const audioBytes = await ttsSynthesizer.synthesize({
          model,
          voice: item.voice,
          input: item.text,
          responseFormat: safeFormat,
          instructions: item.instructions,
        })
        const buffer = Buffer.from(audioBytes)
        fs.writeFileSync(outputPath, buffer)
        fs.mkdirSync(cacheRoot, { recursive: true })
        fs.writeFileSync(cachePath, buffer)
        generated += 1
      }

      // Seed from the existing on-disk manifest on first touch of a language so
      // regenerating a single buddy merges into (rather than replaces) the
      // manifest and never orphans the other buddies' already-baked clips.
      const manifest =
        manifests.get(item.language) ??
        readExistingVoiceManifest(voiceRoot, item.language) ?? {
          version: KIDS_VOICE_MANIFEST_VERSION,
          characters: {},
        }
      manifest.characters[item.characterId] ??= {}
      manifest.characters[item.characterId][item.lineKey] = fileName
      manifests.set(item.language, manifest)
    }

    onClip?.(clip, index, work.length)
  }

  if (!dryRun) {
    for (const [language, manifest] of manifests) {
      const manifestPath = path.resolve(voiceRoot, language, "manifest.json")
      assertWithinBase(voiceRoot, manifestPath, "manifest")
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    }
  }

  return {
    clips,
    total: work.length,
    cachedHits,
    generated,
    dryRun,
  }
}
