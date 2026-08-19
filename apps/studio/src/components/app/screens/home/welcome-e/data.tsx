import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import {
  Volume2,
  BookOpenText,
  Languages,
  Hand,
  Captions,
  HelpCircle,
  BookOpen,
  List,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

export interface Feature {
  key: string
  icon: LucideIcon
  /** Saturated tile: solid stage color + white glyph. */
  solid: string
  /** Soft tile: 10% stage tint + stage-colored glyph. */
  soft: string
  label: ReactNode
  blurb: ReactNode
}

/** The reader-facing accessibility modes — the marquee of every edition. */
export const MODES: Feature[] = [
  { key: "listen", icon: Volume2, solid: "bg-stage-speech text-white", soft: "bg-stage-speech/10 text-stage-speech", label: <Trans>Listen</Trans>, blurb: <Trans>Natural text-to-speech, timed page by page.</Trans> },
  { key: "easy-read", icon: BookOpenText, solid: "bg-stage-easy-read text-white", soft: "bg-stage-easy-read/10 text-stage-easy-read", label: <Trans>Easy-read</Trans>, blurb: <Trans>Simplified text for lower reading levels.</Trans> },
  { key: "translate", icon: Languages, solid: "bg-stage-translate text-white", soft: "bg-stage-translate/10 text-stage-translate", label: <Trans>Translate</Trans>, blurb: <Trans>The same edition in every language.</Trans> },
  { key: "sign", icon: Hand, solid: "bg-stage-sign text-white", soft: "bg-stage-sign/10 text-stage-sign", label: <Trans>Sign</Trans>, blurb: <Trans>Sign-language video linked to each page.</Trans> },
  { key: "captions", icon: Captions, solid: "bg-stage-captions text-white", soft: "bg-stage-captions/10 text-stage-captions", label: <Trans>Captions</Trans>, blurb: <Trans>Described visuals and image alt-text.</Trans> },
]

/** Supporting outputs every edition also gains. */
export const EXTRAS: Feature[] = [
  { key: "quizzes", icon: HelpCircle, solid: "bg-stage-quizzes text-white", soft: "bg-stage-quizzes/10 text-stage-quizzes", label: <Trans>Quizzes</Trans>, blurb: <Trans>Comprehension checks per section.</Trans> },
  { key: "glossary", icon: BookOpen, solid: "bg-stage-glossary text-white", soft: "bg-stage-glossary/10 text-stage-glossary", label: <Trans>Glossary</Trans>, blurb: <Trans>Key terms, defined in place.</Trans> },
  { key: "contents", icon: List, solid: "bg-stage-toc text-white", soft: "bg-stage-toc/10 text-stage-toc", label: <Trans>Contents</Trans>, blurb: <Trans>Navigable, auto-generated.</Trans> },
  { key: "wcag", icon: ShieldCheck, solid: "bg-stage-validation text-white", soft: "bg-stage-validation/10 text-stage-validation", label: <Trans>WCAG validated</Trans>, blurb: <Trans>Checked before every export.</Trans> },
]

export const ALL_FEATURES: Feature[] = [...MODES, ...EXTRAS]
