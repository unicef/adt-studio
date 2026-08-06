import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { AudioLines, Image, Languages, GraduationCap, type LucideIcon } from "lucide-react"
import { CAPABILITIES, type Capability } from "./capabilities"

export type DemoKind = "audio" | "caption" | "language" | "quiz"

export interface Category {
  id: string
  label: MessageDescriptor
  tagline: MessageDescriptor
  icon: LucideIcon
  /** Dark-safe tint pair, e.g. "bg-stage-speech/10 text-stage-speech". */
  tint: string
  /** Accent classes for the active tab / highlights. */
  accentText: string
  accentBg: string
  items: Capability[]
  demo: DemoKind
}

/**
 * Four outcome-oriented buckets so the first-run screen shows *what a student gets*
 * without dumping all 12 pipeline stages at once. Extraction, sectioning and
 * storyboards run automatically underneath these.
 */
export const CATEGORIES: Category[] = [
  {
    id: "listen",
    label: msg`Listen`,
    tagline: msg`Every page, read aloud`,
    icon: AudioLines,
    tint: "bg-stage-speech/10 text-stage-speech",
    accentText: "text-stage-speech",
    accentBg: "bg-stage-speech",
    items: [CAPABILITIES[4]],
    demo: "audio",
  },
  {
    id: "see",
    label: msg`See`,
    tagline: msg`Described and illustrated`,
    icon: Image,
    tint: "bg-stage-captions/10 text-stage-captions",
    accentText: "text-stage-captions",
    accentBg: "bg-stage-captions",
    items: [CAPABILITIES[3], CAPABILITIES[2], CAPABILITIES[6]],
    demo: "caption",
  },
  {
    id: "understand",
    label: msg`Understand`,
    tagline: msg`Any language, made simple`,
    icon: Languages,
    tint: "bg-stage-translate/10 text-stage-translate",
    accentText: "text-stage-translate",
    accentBg: "bg-stage-translate",
    items: [CAPABILITIES[5], CAPABILITIES[7], CAPABILITIES[9]],
    demo: "language",
  },
  {
    id: "check",
    label: msg`Check`,
    tagline: msg`Practice and navigate`,
    icon: GraduationCap,
    tint: "bg-stage-quizzes/10 text-stage-quizzes",
    accentText: "text-stage-quizzes",
    accentBg: "bg-stage-quizzes",
    items: [CAPABILITIES[8], CAPABILITIES[10], CAPABILITIES[11]],
    demo: "quiz",
  },
]
