/**
 * Kids voice pack playback.
 *
 * Books may ship pre-generated buddy voice clips per language:
 *
 *   assets/kids-voice/<lang>/manifest.json
 *   assets/kids-voice/<lang>/<character>/<line-key>.mp3
 *
 * Manifest shape: `{ version, characters: { [characterId]: { [lineKey]:
 * "relative/file.mp3" } } }` with files relative to the manifest's folder.
 *
 * Everything degrades silently: no manifest (older books, un-generated
 * languages), a missing character, or a missing line key simply means the
 * buddy speaks through the text bubble only. Playback must never throw.
 */

export interface KidsVoiceManifest {
  version: number
  characters: Record<string, Record<string, string>>
}

const manifestCache = new Map<string, Promise<KidsVoiceManifest | null>>()

let currentAudio: HTMLAudioElement | null = null

function voiceBase(lang: string): string {
  return `./assets/kids-voice/${lang}`
}

export function loadKidsVoiceManifest(
  lang: string,
): Promise<KidsVoiceManifest | null> {
  const cached = manifestCache.get(lang)
  if (cached) return cached

  const pending = (async () => {
    try {
      const res = await fetch(`${voiceBase(lang)}/manifest.json`)
      if (!res.ok) return null
      return (await res.json()) as KidsVoiceManifest
    } catch {
      return null
    }
  })()
  manifestCache.set(lang, pending)
  return pending
}

/** Test-only: reset the module-level manifest cache. */
export function clearKidsVoiceCache(): void {
  manifestCache.clear()
  currentAudio = null
}

/**
 * Fire-and-forget clip playback. Resolves `true` only when a clip was found
 * and playback started; any failure resolves `false` without throwing.
 */
export async function playBuddyLine(
  lang: string,
  characterId: string,
  lineKey: string,
): Promise<boolean> {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return false
  }
  try {
    const manifest = await loadKidsVoiceManifest(lang)
    const file = manifest?.characters?.[characterId]?.[lineKey]
    if (!file) return false

    currentAudio?.pause()
    const audio = new Audio(`${voiceBase(lang)}/${file}`)
    currentAudio = audio
    await Promise.resolve(audio.play()).catch(() => undefined)
    return true
  } catch {
    return false
  }
}
