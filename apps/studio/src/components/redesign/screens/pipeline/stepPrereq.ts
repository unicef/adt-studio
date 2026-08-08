import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { StageName } from "@adt/types"
import type { DockSlug } from "./plugins"

/**
 * Gating rules lifted from the old pipeline UI, where each landing page named
 * its blocking upstream through `PrereqGuard upstreamSlug` (or, for sign
 * language, a direct storyboard check).
 *
 * `null` means the step never blocks: Extract has no upstream, and Sectioning
 * and Storyboard pull their missing ancestors into the run instead of refusing
 * to start — "Running Sectioning will run Extract first".
 *
 * Note this is the UI rule, not the DAG execution rule. Translate depends on
 * easy-read/quizzes/captions/glossary/toc in `PIPELINE`, but the old UI only
 * ever blocked it on Storyboard, so that is what we mirror.
 */
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
}

/** What we know about a book's progress, from the run status and its artifacts. */
export interface StageEvidence {
  /** The run reports this stage as done. */
  completed: (stage: string) => boolean
  pageCount: number
  hasSections: boolean
  hasRendering: boolean
}

/**
 * A stage counts as satisfied when the run reports it done *or* when its
 * artifacts are already on disk. Older books carry pages, sections and
 * renderings without the matching entry in `completedStages`, and gating
 * purely on the flag would lock their whole pipeline.
 */
export function isStageSatisfied(stage: StageName, evidence: StageEvidence): boolean {
  if (evidence.completed(stage)) return true
  if (stage === "extract") return evidence.pageCount > 0
  if (stage === "sectioning") return evidence.hasSections
  if (stage === "storyboard") return evidence.hasRendering
  return false
}

/** True while the step's blocking upstream has produced nothing yet. */
export function isStepLocked(slug: DockSlug, evidence: StageEvidence): boolean {
  const upstream = STEP_PREREQ[slug]
  return upstream != null && !isStageSatisfied(upstream, evidence)
}

/** Why the upstream is needed — the copy the old landing pages showed. */
export const STEP_PREREQ_REASON: Partial<Record<DockSlug, MessageDescriptor>> = {
  captions: msg`Image Captions describes the images Storyboard placed. Finish Storyboard before running this stage.`,
  quizzes: msg`Quizzes are written from the sections Storyboard placed. Finish Storyboard before running this stage.`,
  glossary: msg`Glossary scans the text Storyboard placed. Finish Storyboard before running this stage.`,
  toc: msg`The table of contents is built from the headings Storyboard placed. Finish Storyboard before running this stage.`,
  "easy-read": msg`Easy Read rewrites the text Storyboard placed. Finish Storyboard before running this stage.`,
  translate: msg`Translation runs on the typed sections placed by Storyboard. Finish Storyboard before running this stage.`,
  speech: msg`Speech narrates the translated text Language produces. Finish Language before running this stage.`,
  "sign-language": msg`Sign Language assigns one video per Storyboard section. Finish Storyboard first so you have sections to match against.`,
}
