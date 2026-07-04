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

export interface FeedbackAudioDefinition {
  key: FeedbackAudioKey
  textId: string
  messageKey: string
  audioMessageKey?: string
}

export const FEEDBACK_AUDIO_DEFINITIONS = [
  {
    key: "speedSlow",
    textId: "speed-slow",
    messageKey: "feedback-speed-slow",
  },
  {
    key: "speedNormal",
    textId: "speed-normal",
    messageKey: "feedback-speed-normal",
  },
  {
    key: "speedFast",
    textId: "speed-fast",
    messageKey: "feedback-speed-fast",
  },
  {
    key: "speedVeryFast",
    textId: "speed-very-fast",
    messageKey: "feedback-speed-very-fast",
  },
  {
    key: "readAloudOn",
    textId: "read-aloud-on",
    messageKey: "feedback-read-aloud-on",
  },
  {
    key: "readAloudOff",
    textId: "read-aloud-off",
    messageKey: "feedback-read-aloud-off",
  },
  {
    key: "easyReadOn",
    textId: "easy-read-on",
    messageKey: "feedback-easy-read-on",
  },
  {
    key: "easyReadOff",
    textId: "easy-read-off",
    messageKey: "feedback-easy-read-off",
  },
  {
    key: "languageChanged",
    textId: "language-changed",
    messageKey: "feedback-language-changed",
    audioMessageKey: "feedback-language-changed-audio",
  },
  {
    key: "volumeMuted",
    textId: "volume-muted",
    messageKey: "feedback-volume-muted",
  },
  {
    key: "volumeUnmuted",
    textId: "volume-unmuted",
    messageKey: "feedback-volume-unmuted",
  },
  {
    key: "volumeLevel",
    textId: "volume-level",
    messageKey: "feedback-volume-level",
    audioMessageKey: "feedback-volume-level-audio",
  },
] as const satisfies readonly FeedbackAudioDefinition[]
