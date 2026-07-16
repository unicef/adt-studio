/**
 * Kids voice pack playback.
 *
 * Books may ship pre-generated buddy voice clips per language (produced by
 * the Studio kids-voice generator, packaged by package-web):
 *
 *   content/kids-voice/<lang>/manifest.json
 *   content/kids-voice/<lang>/<character>/<line-key>.mp3
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
// Bumped whenever playback changes (a new single line, a new sequence, or a
// stop) so an in-flight `playBuddyLineSequence` knows it was superseded and
// halts instead of talking over the newer audio.
let playbackToken = 0

function voiceBase(lang: string): string {
  return `./content/kids-voice/${lang}`
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
  playbackToken++ // any single line supersedes a running sequence
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

/**
 * Play several clips back-to-back for one character (e.g. a step's title then
 * its description), waiting for each to finish. A newer `playBuddyLine`,
 * another sequence, or `stopBuddyLine` supersedes an in-flight sequence.
 * Missing clips are skipped; nothing throws.
 */
export async function playBuddyLineSequence(
  lang: string,
  characterId: string,
  lineKeys: readonly string[],
): Promise<void> {
  if (typeof window === "undefined" || typeof Audio === "undefined") return
  const token = ++playbackToken
  const manifest = await loadKidsVoiceManifest(lang)
  for (const lineKey of lineKeys) {
    if (token !== playbackToken) return
    const file = manifest?.characters?.[characterId]?.[lineKey]
    if (!file) continue
    currentAudio?.pause()
    const audio = new Audio(`${voiceBase(lang)}/${file}`)
    currentAudio = audio
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      audio.addEventListener("ended", done, { once: true })
      audio.addEventListener("error", done, { once: true })
      Promise.resolve(audio.play()).catch(() => done())
    })
  }
}

/** Stop the currently-playing clip or sequence, if any. Safe to call anytime. */
export function stopBuddyLine(): void {
  playbackToken++
  currentAudio?.pause()
  currentAudio = null
}
