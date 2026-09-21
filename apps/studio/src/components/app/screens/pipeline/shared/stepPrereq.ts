import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { StageName } from "@adt/types"
import type { DockSlug } from "./plugins"

export const STEP_PREREQ: Record<DockSlug, StageName | null> = {
  extract: null,
  sectioning: null,
  captions: "storyboard",
  quizzes: "storyboard",
  glossary: "storyboard",
  toc: "storyboard",
  "easy-read": "storyboard",
  translate: "storyboard",
  speech: "translate",
  "sign-language": "storyboard",
  validation: "storyboard",
}

export interface StageEvidence {
  covered: (stage: string) => boolean
  pageCount: number
  hasSections: boolean
  hasRendering: boolean
}

export function isStageSatisfied(stage: StageName, evidence: StageEvidence): boolean {
  if (evidence.covered(stage)) return true
  if (stage === "extract") return evidence.pageCount > 0
  if (stage === "sectioning") return evidence.hasSections
  if (stage === "storyboard") return evidence.hasRendering
  return false
}

export function isStepLocked(slug: DockSlug, evidence: StageEvidence): boolean {
  const upstream = STEP_PREREQ[slug]
  return upstream != null && !isStageSatisfied(upstream, evidence)
}

export const STEP_PREREQ_REASON: Partial<Record<DockSlug, MessageDescriptor>> = {
  captions: msg`Image Captions describes the images Storyboard placed. Finish Storyboard before running this stage.`,
  quizzes: msg`Quizzes are written from the sections Storyboard placed. Finish Storyboard before running this stage.`,
  glossary: msg`Glossary scans the text Storyboard placed. Finish Storyboard before running this stage.`,
  toc: msg`The table of contents is built from the headings Storyboard placed. Finish Storyboard before running this stage.`,
  "easy-read": msg`Easy Read rewrites the text Storyboard placed. Finish Storyboard before running this stage.`,
  translate: msg`Translation runs on the typed sections placed by Storyboard. Finish Storyboard before running this stage.`,
  speech: msg`Speech narrates the translated text Language produces. Finish Language before running this stage.`,
  "sign-language": msg`Sign Language assigns one video per Storyboard section. Finish Storyboard first so you have sections to match against.`,
  validation: msg`Validation checks the packaged book Storyboard produces. Finish Storyboard before running this stage.`,
}
