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
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import {
  KIDS_LANGUAGE_NAMES,
  KIDS_VOICE_MANIFEST_VERSION,
  getKidsBuddyMeta,
  getKidsSpeakableLines,
  type KidsVoiceManifest,
} from "@adt/types"
import type { TTSSynthesizer } from "@adt/llm"
import {
  computeSpeechCacheKey,
  isSpeakableText,
  stripEmojis,
} from "./speech.js"

const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/

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
  languages: string[]
  characters: string[]
  /** language → merged interface-translation catalog for that language. */
  translationsByLanguage: Record<string, Record<string, string>>
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

export async function generateKidsVoicePack(
  options: GenerateKidsVoicePackOptions,
): Promise<KidsVoiceGenerationResult> {
  const {
    bookDir,
    cacheDir,
    languages,
    characters,
    translationsByLanguage,
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
      const meta = getKidsBuddyMeta(safeCharacter)
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
          voice: meta.voice.voice,
          instructions: meta.voice.instructions,
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
    const cached = fs.existsSync(cachePath)

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

      const manifest = manifests.get(item.language) ?? {
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

/**
 * Stable fingerprint of one language's voice-pack inputs — lets callers show
 * "up to date / stale" in the UI without running a dry-run synthesis pass.
 */
export function computeKidsVoicePackFingerprint(options: {
  language: string
  characters: string[]
  dict: Record<string, string>
  model: string
  provider?: string
}): string {
  const { language, characters, dict, model, provider = "openai" } = options
  const texts: Record<string, string> = {}
  for (const characterId of [...characters].sort()) {
    const meta = getKidsBuddyMeta(characterId)
    for (const line of getKidsSpeakableLines(characterId)) {
      texts[`${characterId}:${line.key}`] = resolveKidsLineText({
        lineKey: line.key,
        fallback: line.fallback,
        language,
        characterId,
        dict,
      })
      texts[`${characterId}:voice`] = `${meta.voice.voice}|${meta.voice.instructions}`
    }
  }
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ language, model, provider, texts }))
    .digest("hex")
}
