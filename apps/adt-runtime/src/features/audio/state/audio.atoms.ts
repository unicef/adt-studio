/**
 * Audio + TTS state atoms.
 *
 * The original `state` object stored both user preferences (readAloudMode,
 * audioSpeed, …) and live playback state (isPlaying, currentIndex, …) in a
 * single bag. We split persistent prefs from ephemeral playback state so each
 * concern owns its lifetime explicitly.
 */
import { ephemeralAtom, persistedBoolAtom, persistedNumberAtom } from "@/shared/state/persist"

// User preferences — survive navigation.
export const readAloudModeAtom = persistedBoolAtom("readAloudMode", false)
export const autoplayModeAtom = persistedBoolAtom("autoplayMode", true)
export const wordHighlightModeAtom = persistedBoolAtom("wordHighlightMode", true)
export const describeImagesModeAtom = persistedBoolAtom("describeImagesMode", false)
export const audioSpeedAtom = persistedNumberAtom("audioSpeed", 1)
export const audioVolumeAtom = persistedNumberAtom("audioVolume", 1)

// Live playback state.
//
// `isPlaying` is *persistent* on purpose: each page is its own document, so
// a navigation while the user is reading aloud means a full reload. We need
// to carry "the user is currently listening" across that reload so the next
// page resumes playback automatically. `useAudioPlayer` reads this on mount
// and triggers auto-start (subject to browser autoplay policy).
//
// `currentAudioIndex` stays ephemeral — a TTS index from page N has no
// meaning on page N+1, so resume always restarts from item 0.
export const isPlayingAtom = persistedBoolAtom("isPlaying", false)
export const currentAudioIndexAtom = ephemeralAtom(0)
export const playBarVisibleAtom = ephemeralAtom(false)
export const speedMenuOpenAtom = ephemeralAtom(false)

export type ActiveMediaKind = "tts" | "sign-language"
export const activeMediaAtom = ephemeralAtom<ActiveMediaKind | null>(null)

/**
 * The list of `[data-id]`-bearing nodes the runtime found in `#content`,
 * in reading order. Each one becomes a TTS unit. Populated once per page
 * by the content scanner.
 */
export const audioElementsAtom = ephemeralAtom<HTMLElement[]>([])

/**
 * Per-textId word timestamps loaded from
 * `./content/i18n/<lang>/timecode/timecode_output.json`. Keyed by the
 * `data-id` of the element being read aloud. Empty when the book hasn't
 * generated word-level timings — `useAudioPlayer` falls back to estimating
 * timings via the tokenizer in that case.
 */
export interface WordTimestamp {
  text: string
  start: number
  end: number
}
export type TimecodeMap = Record<string, WordTimestamp[]>
export const timecodeMapAtom = ephemeralAtom<TimecodeMap>({})
