import type { ComponentType } from "react"
import type { PluginSlug } from "../plugins"
import { CaptionsStep } from "./CaptionsStep"
import { EasyReadStep } from "./EasyReadStep"
import { GlossaryStep } from "./GlossaryStep"
import { QuizzesStep } from "./QuizzesStep"
import { SignLanguageStep } from "./SignLanguageStep"
import { SpeechStep } from "./SpeechStep"
import { TocStep } from "./TocStep"
import { TranslateStep } from "./TranslateStep"
import type { StepProps } from "./types"

export const STEP_VIEWS: Record<PluginSlug, ComponentType<StepProps>> = {
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
