import type { ComponentType } from "react"
import type { DockSlug } from "@/components/redesign/screens/pipeline/shared/plugins"
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
import { ValidationStep } from "./ValidationStep"
import type { StepProps } from "./shared/types"

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
  validation: ValidationStep,
}

export type { StepProps, StepFrame } from "./shared/types"
