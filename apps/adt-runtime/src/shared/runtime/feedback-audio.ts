import { getDefaultStore } from "jotai"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"

export type FeedbackAudioKey =
  | "speedSlow"
  | "speedNormal"
  | "speedFast"
  | "speedVeryFast"
  | "readAloudOn"
  | "readAloudOff"
  | "easyReadOn"
  | "easyReadOff"
  | "languageChanged"
  | "volumeMuted"
  | "volumeUnmuted"
  | "volumeLevel"

const FEEDBACK_AUDIO_FILE_BASES: Record<FeedbackAudioKey, string> = {
  speedSlow: "speed-slow",
  speedNormal: "speed-normal",
  speedFast: "speed-fast",
  speedVeryFast: "speed-very-fast",
  readAloudOn: "read-aloud-on",
  readAloudOff: "read-aloud-off",
  easyReadOn: "easy-read-on",
  easyReadOff: "easy-read-off",
  languageChanged: "language-changed",
  volumeMuted: "volume-muted",
  volumeUnmuted: "volume-unmuted",
  volumeLevel: "volume-level",
}

const GENERATED_AUDIO_EXTENSIONS = ["mp3", "wav", "opus", "aac", "flac"]

const FALLBACK_EFFECT = "./assets/sounds/success.mp3"
const cache = new Map<string, HTMLAudioElement>()
const existenceCache = new Map<string, Promise<boolean>>()

/** Builds the ordered list of language folders to try for feedback audio. */
function feedbackLanguageCandidates(language: string): string[] {
  const normalized = language.toLowerCase().replace(/_/g, "-")
  const base = normalized.split("-")[0]
  return Array.from(new Set([normalized, base, "en"].filter(Boolean)))
}

/** Reuses audio elements by URL so repeated feedback does not recreate media nodes. */
function getAudio(url: string): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null
  const existing = cache.get(url)
  if (existing) return existing
  const audio = new Audio(url)
  audio.volume = 0.7
  audio.preload = "auto"
  cache.set(url, audio)
  return audio
}

/** Checks whether an optional feedback audio asset exists before playback. */
function audioAssetExists(url: string): Promise<boolean> {
  if (url === FALLBACK_EFFECT || typeof fetch === "undefined") return Promise.resolve(true)
  const existing = existenceCache.get(url)
  if (existing) return existing
  const request = fetch(url, { method: "HEAD", cache: "no-store" })
    .then((response) => response.ok || response.status === 405 || response.status === 0)
    .catch(() => true)
  existenceCache.set(url, request)
  return request
}

/** Plays one URL and reports whether playback started successfully. */
async function playUrl(url: string): Promise<boolean> {
  if (!(await audioAssetExists(url))) return false
  const audio = getAudio(url)
  if (!audio) return false
  try {
    audio.pause()
    audio.currentTime = 0
    audio.onended = null
    audio.onerror = null
    const finished = new Promise<boolean>((resolve) => {
      const cleanup = () => {
        audio.onended = null
        audio.onerror = null
      }
      audio.onended = () => {
        cleanup()
        resolve(true)
      }
      audio.onerror = () => {
        cleanup()
        resolve(false)
      }
    })
    await audio.play()
    return await finished
  } catch {
    audio.onended = null
    audio.onerror = null
    return false
  }
}

/** Plays localized feedback audio with English and generic-success fallbacks. */
export async function playFeedbackAudio(key: FeedbackAudioKey): Promise<void> {
  const fileBase = FEEDBACK_AUDIO_FILE_BASES[key]
  const language = getDefaultStore().get(currentLanguageAtom) as string
  const urls = feedbackLanguageCandidates(language).flatMap((candidate) =>
    GENERATED_AUDIO_EXTENSIONS.map(
      (extension) => `./assets/feedback-audio/${candidate}/${fileBase}.${extension}`,
    ),
  )

  for (const url of urls) {
    if (await playUrl(url)) return
  }
  await playUrl(FALLBACK_EFFECT)
}
