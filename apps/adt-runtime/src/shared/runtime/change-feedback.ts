import { getDefaultStore } from "jotai"
import { toast } from "sonner"
import {
  audioSpeedAtom,
  audioVolumeAtom,
  readAloudModeAtom,
} from "@/features/audio/state/audio.atoms"
import {
  currentLanguageAtom,
  translationsAtom,
} from "@/features/language/state/language.atoms"
import { easyReadModeAtom } from "@/shared/state/ui.atoms"
import { announceToScreenReader } from "@/shared/lib/aria-live"
import { playFeedbackAudio, type FeedbackAudioKey } from "@/shared/runtime/feedback-audio"

interface FeedbackDefinition {
  audioKey: FeedbackAudioKey
  messageKey: string
}

const FEEDBACK = {
  speedSlow: { audioKey: "speedSlow", messageKey: "feedback-speed-slow" },
  speedNormal: { audioKey: "speedNormal", messageKey: "feedback-speed-normal" },
  speedFast: { audioKey: "speedFast", messageKey: "feedback-speed-fast" },
  speedVeryFast: { audioKey: "speedVeryFast", messageKey: "feedback-speed-very-fast" },
  readAloudOn: { audioKey: "readAloudOn", messageKey: "feedback-read-aloud-on" },
  readAloudOff: { audioKey: "readAloudOff", messageKey: "feedback-read-aloud-off" },
  easyReadOn: { audioKey: "easyReadOn", messageKey: "feedback-easy-read-on" },
  easyReadOff: { audioKey: "easyReadOff", messageKey: "feedback-easy-read-off" },
  languageChanged: { audioKey: "languageChanged", messageKey: "feedback-language-changed" },
  volumeMuted: { audioKey: "volumeMuted", messageKey: "feedback-volume-muted" },
  volumeUnmuted: { audioKey: "volumeUnmuted", messageKey: "feedback-volume-unmuted" },
  volumeLevel: { audioKey: "volumeLevel", messageKey: "feedback-volume-level" },
} satisfies Record<string, FeedbackDefinition>

function translateFeedback(
  definition: FeedbackDefinition,
  variables: Record<string, string> = {},
): string {
  const dict = getDefaultStore().get(translationsAtom)
  const template = dict[definition.messageKey] || definition.messageKey
  return template.replace(/\$\{(.*?)\}/g, (_, name) => variables[name] ?? "")
}

function notifyFeedback(
  definition: FeedbackDefinition,
  variables: Record<string, string> = {},
): void {
  const message = translateFeedback(definition, variables)
  toast.success(message, { id: "adt-change-feedback", duration: 2800 })
  announceToScreenReader(message)
  void playFeedbackAudio(definition.audioKey)
}

function speedFeedback(speed: number): FeedbackDefinition {
  if (speed <= 0.5) return FEEDBACK.speedSlow
  if (speed >= 2) return FEEDBACK.speedVeryFast
  if (speed > 1) return FEEDBACK.speedFast
  return FEEDBACK.speedNormal
}

export function subscribeChangeFeedback(): () => void {
  const store = getDefaultStore()
  let lastSpeed = store.get(audioSpeedAtom) as number
  let lastReadAloud = store.get(readAloudModeAtom) as boolean
  let lastEasyRead = store.get(easyReadModeAtom) as boolean
  let lastVolume = store.get(audioVolumeAtom) as number
  let lastLanguage = store.get(currentLanguageAtom) as string
  let pendingLanguage: string | null = null
  let volumeTimer: ReturnType<typeof setTimeout> | null = null

  const notifyVolumeLevel = (volume: number): void => {
    const percent = String(Math.round(Math.max(0, Math.min(1, volume)) * 100))
    notifyFeedback(FEEDBACK.volumeLevel, { percent })
  }

  const unsubs = [
    store.sub(audioSpeedAtom, () => {
      const next = store.get(audioSpeedAtom) as number
      if (next === lastSpeed) return
      lastSpeed = next
      notifyFeedback(speedFeedback(next))
    }),
    store.sub(readAloudModeAtom, () => {
      const next = store.get(readAloudModeAtom) as boolean
      if (next === lastReadAloud) return
      lastReadAloud = next
      notifyFeedback(next ? FEEDBACK.readAloudOn : FEEDBACK.readAloudOff)
    }),
    store.sub(easyReadModeAtom, () => {
      const next = store.get(easyReadModeAtom) as boolean
      if (next === lastEasyRead) return
      lastEasyRead = next
      notifyFeedback(next ? FEEDBACK.easyReadOn : FEEDBACK.easyReadOff)
    }),
    store.sub(audioVolumeAtom, () => {
      const next = store.get(audioVolumeAtom) as number
      if (next === lastVolume) return
      const wasMuted = lastVolume === 0
      const isMuted = next === 0
      lastVolume = next

      if (volumeTimer) clearTimeout(volumeTimer)
      if (isMuted) {
        notifyFeedback(FEEDBACK.volumeMuted)
      } else if (wasMuted) {
        notifyFeedback(FEEDBACK.volumeUnmuted)
      } else {
        volumeTimer = setTimeout(() => notifyVolumeLevel(next), 500)
      }
    }),
    store.sub(currentLanguageAtom, () => {
      const next = store.get(currentLanguageAtom) as string
      if (next === lastLanguage) return
      lastLanguage = next
      pendingLanguage = next
    }),
    store.sub(translationsAtom, () => {
      if (!pendingLanguage) return
      const language = store.get(translationsAtom)["language-name"] || pendingLanguage
      pendingLanguage = null
      notifyFeedback(FEEDBACK.languageChanged, { language })
    }),
  ]

  return () => {
    if (volumeTimer) clearTimeout(volumeTimer)
    for (const unsub of unsubs) unsub()
  }
}
