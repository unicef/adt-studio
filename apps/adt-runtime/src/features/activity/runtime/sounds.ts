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
  page_turn: "page-turn.mp3",
  finish: "finish.mp3",
}

/** Page turns happen constantly, so the cue sits well under the verdicts. */
const SOUND_VOLUMES: Partial<Record<ActivitySoundKey, number>> = {
  page_turn: 0.3,
  finish: 0.45,
}

const DEFAULT_VOLUME = 0.5

/** How long a cue needs before a navigation tears the document down. */
export const PAGE_TURN_LEAD_MS = 120

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

export function playActivitySound(key: ActivitySoundKey): void {
  if (!soundEffectsEnabled()) return
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
