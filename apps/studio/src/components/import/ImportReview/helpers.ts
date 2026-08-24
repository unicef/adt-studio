import { msg } from "@lingui/core/macro"
import {
  Bot,
  FileCode2,
  FileText,
  Globe,
  Image,
  Puzzle,
  Scissors,
  Video,
  type LucideIcon,
} from "lucide-react"
import type { AnyImportPreview, ImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { STAGE_DESCRIPTION_MESSAGES, STAGE_LABEL_MESSAGES } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"

export const FEATURE_SLUGS = [
  "storyboard",
  "quizzes",
  "captions",
  "glossary",
  "toc",
  "easy-read",
  "sign-language",
  "translate",
  "speech",
] as const

export const FEATURES = FEATURE_SLUGS.map((slug) => {
  const stage = STAGES.find((candidate) => candidate.slug === slug)
  const label = STAGE_LABEL_MESSAGES[slug]
  const description = STAGE_DESCRIPTION_MESSAGES[slug]
  if (!stage || !label || !description) throw new Error(`Missing pipeline stage metadata: ${slug}`)
  return { ...stage, label, description }
})


export type ReviewTab = "overview" | "features" | "review"
export type DetailsDialog = "validation" | "guide" | null
export type TabTransitionPhase = "idle" | "exiting" | "entering"

export const TAB_EXIT_DURATION_MS = 120
export const TAB_ENTER_DURATION_MS = 180


export function previewTitle(preview: AnyImportPreview): string {
  if (isPartImportPreview(preview)) return preview.title ?? preview.sourceLabel
  if (isAdtBundleImportPreview(preview)) return preview.title
  return preview.title ?? preview.label
}

export function previewCover(preview: AnyImportPreview): string | null {
  return preview.coverBase64
}

export function needsReview(preview: AnyImportPreview, unresolvedActivityCount: number): boolean {
  if (isAdtBundleImportPreview(preview)) {
    return !preview.compatibility.supported || unresolvedActivityCount > 0
  }
  return !isPartImportPreview(preview) && Boolean(preview.validationError)
}

export type FeatureStatus = "recovered" | "needs-regeneration" | "available"

/** The API reports what the import will actually produce. A published archive
 * can *use* a feature whose pipeline data cannot be rebuilt from it (Easy Read,
 * quizzes, sign language) — those have to be generated again in Studio, so they
 * must not be presented as carried over. */
export function featureStatus(preview: AnyImportPreview, slug: string): FeatureStatus {
  if (isPartImportPreview(preview)) return "available"
  if (isAdtBundleImportPreview(preview)) {
    return preview.featureRecovery?.[slug] ?? "available"
  }
  return (preview as ImportPreview).stages[slug]?.status === "done"
    ? "recovered"
    : "available"
}
