/**
 * Activity sound effects — shared across activity types. Lazily constructs
 * <Audio> elements on first use and silently swallows autoplay errors
 * (browsers reject playback until the user interacts).
 */

export type ActivitySoundKey =
  | "drop"
  | "success"
  | "error"
  | "reset"
  | "validate_success"
  | "validate_error"

const SOUND_FILES: Record<ActivitySoundKey, string> = {
  drop: "drop.mp3",
  success: "success.mp3",
  error: "error.mp3",
  reset: "reset.mp3",
  validate_success: "validate_success.mp3",
  // The legacy bundle aliased validate_error to drop.mp3 — keep the same so
  // existing books with the legacy sound mapping behave identically.
  validate_error: "drop.mp3",
}

let cache: Partial<Record<ActivitySoundKey, HTMLAudioElement>> | null = null

/**
 * Where the sound files live. Defaults to `./assets/sounds/` (adt/webpub keep
 * them under `assets/` next to the page). The PNLD export strips `assets/` and
 * moves the sounds into `resources/audios/` (edital: all audio in that folder),
 * so it points here via `<meta name="adt-sounds-base" content="../resources/audios/">`.
 */
function soundsBase(): string {
  if (typeof document === "undefined") return "./assets/sounds/"
  const meta = document.querySelector('meta[name="adt-sounds-base"]')?.getAttribute("content")
  if (!meta) return "./assets/sounds/"
  return meta.endsWith("/") ? meta : `${meta}/`
}

function get(key: ActivitySoundKey): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null
  if (!cache) cache = {}
  const existing = cache[key]
  if (existing) return existing
  const audio = new Audio(`${soundsBase()}${SOUND_FILES[key]}`)
  audio.volume = 0.5
  audio.preload = "auto"
  cache[key] = audio
  return audio
}

export function playActivitySound(key: ActivitySoundKey): void {
  const audio = get(key)
  if (!audio) return
  try {
    audio.pause()
    audio.currentTime = 0
    void audio.play().catch(() => {})
  } catch {
    // ignore
  }
}
