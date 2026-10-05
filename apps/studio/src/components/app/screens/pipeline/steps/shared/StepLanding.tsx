import type { ComponentType, ReactNode } from "react"
import { CaptionsLanding } from "../landing/CaptionsLanding"
import { EasyReadLanding } from "../landing/EasyReadLanding"
import { ExtractLanding } from "../landing/ExtractLanding"
import { GlossaryLanding } from "../landing/GlossaryLanding"
import { LanguageLanding } from "../landing/LanguageLanding"
import { QuizzesLanding } from "../landing/QuizzesLanding"
import { SectioningLanding } from "../landing/SectioningLanding"
import { SignLanguageLanding } from "../landing/SignLanguageLanding"
import { SpeechLanding } from "../landing/SpeechLanding"
import { TocLanding } from "../landing/TocLanding"
import { ValidationLanding } from "../landing/ValidationLanding"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"

const LANDINGS: Partial<Record<DockSlug, ComponentType<LandingProps>>> = {
  extract: ExtractLanding,
  sectioning: SectioningLanding,
  captions: CaptionsLanding,
  quizzes: QuizzesLanding,
  glossary: GlossaryLanding,
  toc: TocLanding,
  "easy-read": EasyReadLanding,
  translate: LanguageLanding,
  speech: SpeechLanding,
  "sign-language": SignLanguageLanding,
  validation: ValidationLanding,
}

interface LandingProps {
  bookLabel: string
  beforeRun?: ReactNode
}

export function hasStepLanding(slug: string): boolean {
  return LANDINGS[slug as DockSlug] != null
}

export interface StepLandingProps {
  label: string
  slug: DockSlug
  beforeRun?: ReactNode
}

export function StepLanding({ label, slug, beforeRun }: StepLandingProps) {
  const Landing = LANDINGS[slug]
  if (!Landing) return null
  return <Landing bookLabel={label} beforeRun={beforeRun} />
}
