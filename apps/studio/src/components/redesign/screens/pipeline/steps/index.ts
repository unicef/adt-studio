import type { ComponentType } from "react"
import type { DockSlug } from "../plugins"
import { CaptionsStep } from "./CaptionsStep"
import { EasyReadStep } from "./EasyReadStep"
import { ExtractStep } from "./ExtractStep"
import { GlossaryStep } from "./GlossaryStep"
import { QuizzesStep } from "./QuizzesStep"
import { SectioningStep } from "./SectioningStep"
import { SignLanguageStep } from "./SignLanguageStep"
import { SpeechStep } from "./SpeechStep"
import { TocStep } from "./TocStep"
import { TranslateStep } from "./TranslateStep"
import type { StepProps } from "./types"

export const STEP_VIEWS: Record<DockSlug, ComponentType<StepProps>> = {
  extract: ExtractStep,
  sectioning: SectioningStep,
  captions: CaptionsStep,
  quizzes: QuizzesStep,
  glossary: GlossaryStep,
  toc: TocStep,
  "easy-read": EasyReadStep,
  translate: TranslateStep,
  speech: SpeechStep,
  "sign-language": SignLanguageStep,
}

export type { StepProps, StepFrame } from "./types"
