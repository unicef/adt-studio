import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import {
  FileText,
  Network,
  LayoutGrid,
  Image,
  AudioLines,
  Languages,
  Hand,
  BookOpenText,
  HelpCircle,
  BookOpen,
  List,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

export interface Capability {
  icon: LucideIcon
  tint: string
  title: MessageDescriptor
  blurb: MessageDescriptor
}

export const CAPABILITIES: Capability[] = [
  { icon: FileText, tint: "bg-brand-100 text-brand-600", title: msg`Extract & clean`, blurb: msg`Text, images and structure pulled from any PDF.` },
  { icon: Network, tint: "bg-stage-sectioning/10 text-stage-sectioning", title: msg`Smart sectioning`, blurb: msg`Chapters, headings and learning units detected.` },
  { icon: LayoutGrid, tint: "bg-stage-storyboard/10 text-stage-storyboard", title: msg`Storyboards`, blurb: msg`Content arranged into structured, reflowable layouts.` },
  { icon: Image, tint: "bg-stage-captions/10 text-stage-captions", title: msg`AI image captions`, blurb: msg`Descriptive alt-text for every figure.` },
  { icon: AudioLines, tint: "bg-stage-speech/10 text-stage-speech", title: msg`Audio narration`, blurb: msg`Natural, page-by-page read-aloud.` },
  { icon: Languages, tint: "bg-stage-translate/10 text-stage-translate", title: msg`Translations`, blurb: msg`The same layout in every output language.` },
  { icon: Hand, tint: "bg-stage-sign/10 text-stage-sign", title: msg`Sign language`, blurb: msg`Sign-language video assigned per page.` },
  { icon: BookOpenText, tint: "bg-stage-easy-read/10 text-stage-easy-read", title: msg`Easy-read`, blurb: msg`Simplified text for the accessibility toggle.` },
  { icon: HelpCircle, tint: "bg-stage-quizzes/10 text-stage-quizzes", title: msg`Quizzes`, blurb: msg`Auto-built comprehension checks.` },
  { icon: BookOpen, tint: "bg-stage-glossary/10 text-stage-glossary", title: msg`Glossary`, blurb: msg`Key terms and definitions collected.` },
  { icon: List, tint: "bg-stage-toc/10 text-stage-toc", title: msg`Table of contents`, blurb: msg`Navigable structure generated automatically.` },
  { icon: ShieldCheck, tint: "bg-stage-validation/10 text-stage-validation", title: msg`WCAG validation`, blurb: msg`Whole-book accessibility checks before export.` },
]

export interface CapabilityGroup {
  label: MessageDescriptor
  items: Capability[]
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  { label: msg`Convert`, items: CAPABILITIES.slice(0, 3) },
  { label: msg`Enhance`, items: [CAPABILITIES[3], CAPABILITIES[8], CAPABILITIES[9], CAPABILITIES[10], CAPABILITIES[7]] },
  { label: msg`Localize`, items: [CAPABILITIES[4], CAPABILITIES[5], CAPABILITIES[6]] },
  { label: msg`Validate`, items: [CAPABILITIES[11]] },
]
