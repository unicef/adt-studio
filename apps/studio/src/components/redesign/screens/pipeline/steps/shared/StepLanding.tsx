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
import type { DockSlug } from "@/components/redesign/screens/pipeline/shared/plugins"

/**
 * The stage landings, owned by the redesign. Each one carries its stage's run
 * gating and the settings that drive its preview.
 *
 * Storyboard is deliberately absent — it keeps the redesign's own empty state.
 * Validation has no landing at all.
 */
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
  /** Pre-run checklist from the workspace, rendered above the stage's Run button. */
  beforeRun?: ReactNode
}

export function StepLanding({ label, slug, beforeRun }: StepLandingProps) {
  const Landing = LANDINGS[slug]
  if (!Landing) return null
  return <Landing bookLabel={label} beforeRun={beforeRun} />
}
