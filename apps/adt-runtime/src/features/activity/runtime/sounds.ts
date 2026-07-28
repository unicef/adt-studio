/**
 * Sound effects — activity verdicts plus the kids reading cues. Lazily
 * constructs <Audio> elements on first use and silently swallows autoplay
 * errors (browsers reject playback until the user interacts).
 *
 * Every effect here is incidental audio, so it all obeys `soundEffectsAtom`.
 * Narration and buddy speech are deliberately NOT routed through this module —
 * turning effects off must never silence the story.
 */
import { getDefaultStore } from "jotai"
import { soundEffectsAtom } from "@/shared/state/ui.atoms"

export type ActivitySoundKey =
  | "drop"
  | "success"
  | "error"
  | "reset"
  | "validate_success"
  | "validate_error"
  | "page_turn"
  | "finish"

const SOUND_FILES: Record<ActivitySoundKey, string> = {
  drop: "drop.mp3",
  success: "success.mp3",
  error: "error.mp3",
  reset: "reset.mp3",
  validate_success: "validate_success.mp3",
  // The legacy bundle aliased validate_error to drop.mp3 — keep the same so
  // existing books with the legacy sound mapping behave identically.
  validate_error: "drop.mp3",
  // The shared ADT page-turn clip, used exactly as supplied (the sibling quiz
  // demo ships it but never plays it).
  page_turn: "page_turn.mp3",
  finish: "finish.mp3",
}

/**
 * The page-turn clip is mastered well below the rest of the set (mean -42.6 dB
 * against drop's -33.2 dB), so it needs full gain to be audible at all.
 */
const SOUND_VOLUMES: Partial<Record<ActivitySoundKey, number>> = {
  page_turn: 1,
  finish: 0.45,
}

/**
 * Where to start playback, for clips whose useful part is not at the front.
 *
 * The page-turn clip opens with ~270ms of quiet build and only flicks at 360ms.
 * A page turn tears the document down shortly after the tap, so playing from
 * zero means the child hears the build and never the flick. Seeking to the flick
 * keeps the supplied file untouched and still lands the sound on the tap.
 *
 * Seeking needs loaded metadata, and a `#t=` media fragment does NOT stand in
 * for it (Chromium ignores it and starts at zero). Hence `preloadSound`.
 */
const SOUND_STARTS: Partial<Record<ActivitySoundKey, number>> = {
  page_turn: 0.3,
}

const DEFAULT_VOLUME = 0.5

/**
 * How long the cue needs before a navigation tears the document down.
 *
 * Measured from the clip: silent until 300ms, the flick peaks at 360ms and
 * decays to the noise floor by ~480ms, ending at 840ms. Playback starts at the
 * 300ms mark (see SOUND_STARTS), so 540ms carries the sound through to its end
 * rather than clipping the tail. That latency is the deliberate cost of hearing
 * the whole page turn.
 */
export const PAGE_TURN_LEAD_MS = 540

let cache: Partial<Record<ActivitySoundKey, HTMLAudioElement>> | null = null

function get(key: ActivitySoundKey): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null
  if (!cache) cache = {}
  const existing = cache[key]
  if (existing) return existing
  const audio = new Audio(`./assets/sounds/${SOUND_FILES[key]}`)
  audio.volume = SOUND_VOLUMES[key] ?? DEFAULT_VOLUME
  audio.preload = "auto"
  cache[key] = audio
  return audio
}

export function soundEffectsEnabled(): boolean {
  try {
    return getDefaultStore().get(soundEffectsAtom) !== false
  } catch {
    return true
  }
}

/**
 * Builds the element and starts loading it, so an offset clip can be seeked the
 * moment it is first needed. Without this the first play of the page-turn cue
 * has no metadata yet and starts from zero — i.e. inaudibly.
 */
export function preloadSound(key: ActivitySoundKey): void {
  const audio = get(key)
  audio?.load()
}

export function playActivitySound(key: ActivitySoundKey): void {
  if (!soundEffectsEnabled()) return
  const audio = get(key)
  if (!audio) return
  const start = SOUND_STARTS[key] ?? 0

  const begin = () => {
    try {
      audio.currentTime = start
    } catch {
      // A browser that refuses the seek still plays, just from the top.
    }
    void audio.play().catch(() => {})
  }

  try {
    audio.pause()
    // Playing an offset clip from zero would be inaudible, so wait for the
    // metadata that makes seeking possible rather than firing early.
    if (start > 0 && audio.readyState < 1) {
      audio.addEventListener("loadedmetadata", begin, { once: true })
    } else {
      begin()
    }
  } catch {
    // ignore
  }
}
