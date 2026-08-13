import fs from "node:fs"
import path from "node:path"
import {
  KIDS_BUDDY_IDS,
  KIDS_NARRATOR_ID,
  KIDS_VOICE_DIR,
  KIDS_VOICE_MANIFEST_VERSION,
  KidsModeConfigSchema,
  KidsVoicesFileSchema,
  getKidsNarratorLines,
  getKidsSpeakableLines,
  type KidsModeConfig,
  type KidsVoiceManifest,
  type KidsVoiceStatus,
  type KidsVoicesFile,
} from "@adt/types"

const KIDS_MODE_CONFIG_FILE = "kids-mode.json"
const KIDS_VOICES_CONFIG_FILE = "kids-voices.json"

export function readKidsModeConfig(bookDir: string): KidsModeConfig {
  const file = path.join(bookDir, KIDS_MODE_CONFIG_FILE)
  const fallback: KidsModeConfig = {
    enabled: false,
    buddies: [...KIDS_BUDDY_IDS],
  }
  if (!fs.existsSync(file)) return fallback
  try {
    const parsed = KidsModeConfigSchema.safeParse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    )
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

export function writeKidsModeConfig(
  bookDir: string,
  config: KidsModeConfig,
): void {
  fs.writeFileSync(
    path.join(bookDir, KIDS_MODE_CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}

function emptyVoiceLanguageStatus(language: string) {
  return {
    language,
    hasPack: false,
    clipCount: 0,
    characters: [],
    completeCharacters: [],
    narratorReady: false,
  }
}

function hasCompleteVoiceTrack(
  languageDir: string,
  manifest: KidsVoiceManifest,
  characterId: string,
  expectedKeys: readonly string[],
): boolean {
  const clips = manifest.characters?.[characterId]
  if (!clips) return false
  return expectedKeys.every((key) => {
    const relativePath = clips[key]
    if (!relativePath) return false
    const resolved = path.resolve(languageDir, relativePath)
    if (!resolved.startsWith(`${path.resolve(languageDir)}${path.sep}`)) {
      return false
    }
    return fs.existsSync(resolved)
  })
}

/** Read voice-pack completeness using the same manifest contract as export. */
export function readKidsVoiceStatus(
  bookDir: string,
  languages: readonly string[],
): KidsVoiceStatus {
  const voiceRoot = path.resolve(bookDir, KIDS_VOICE_DIR)
  return {
    languages: languages.map((language) => {
      const languageDir = path.resolve(voiceRoot, language)
      if (!languageDir.startsWith(`${voiceRoot}${path.sep}`)) {
        return emptyVoiceLanguageStatus(language)
      }
      const manifestPath = path.join(languageDir, "manifest.json")
      if (!fs.existsSync(manifestPath)) {
        return emptyVoiceLanguageStatus(language)
      }
      try {
        const manifest = JSON.parse(
          fs.readFileSync(manifestPath, "utf8"),
        ) as KidsVoiceManifest
        if (manifest.version !== KIDS_VOICE_MANIFEST_VERSION) {
          return emptyVoiceLanguageStatus(language)
        }
        const allCharacters = Object.keys(manifest.characters ?? {})
        const characters = allCharacters.filter((id) =>
          (KIDS_BUDDY_IDS as readonly string[]).includes(id),
        )
        const completeCharacters = characters.filter((id) =>
          hasCompleteVoiceTrack(
            languageDir,
            manifest,
            id,
            getKidsSpeakableLines(id).map((line) => line.key),
          ),
        )
        const narratorReady = hasCompleteVoiceTrack(
          languageDir,
          manifest,
          KIDS_NARRATOR_ID,
          getKidsNarratorLines().map((line) => line.key),
        )
        const clipCount = allCharacters.reduce(
          (sum, id) =>
            sum + Object.keys(manifest.characters[id] ?? {}).length,
          0,
        )
        return {
          language,
          hasPack: characters.length > 0,
          clipCount,
          characters,
          completeCharacters,
          narratorReady,
        }
      } catch {
        return emptyVoiceLanguageStatus(language)
      }
    }),
  }
}

/** Stop a Kids export when any selected buddy or narrator voice is incomplete. */
export function assertKidsVoiceExportReady(options: {
  bookDir: string
  languages: readonly string[]
  buddies: readonly string[]
}): KidsVoiceStatus {
  const status = readKidsVoiceStatus(options.bookDir, options.languages)
  const incomplete = status.languages.flatMap((entry) => {
    const missingBuddies = options.buddies.filter(
      (buddy) => !entry.completeCharacters.includes(buddy),
    )
    const missing = [
      ...missingBuddies,
      ...(entry.narratorReady ? [] : [KIDS_NARRATOR_ID]),
    ]
    return missing.length > 0
      ? [`${entry.language} (${missing.join(", ")})`]
      : []
  })
  if (incomplete.length > 0) {
    throw new Error(
      `Kids Mode export requires complete buddy voices for every exported language: ${incomplete.join(", ")}`,
    )
  }
  return status
}

export function readKidsVoicesConfig(bookDir: string): KidsVoicesFile {
  const file = path.join(bookDir, KIDS_VOICES_CONFIG_FILE)
  const fallback: KidsVoicesFile = { overrides: {} }
  if (!fs.existsSync(file)) return fallback
  try {
    const parsed = KidsVoicesFileSchema.safeParse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    )
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

export function writeKidsVoicesConfig(
  bookDir: string,
  config: KidsVoicesFile,
): void {
  fs.writeFileSync(
    path.join(bookDir, KIDS_VOICES_CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}
