import type {
  ReviewerValidationCriterion,
  ReviewerValidationSection,
  ValidationFixStage,
} from "@adt/types"
import { hasStagePages } from "@/components/pipeline/stage-config"
import type { AccessibilityCategoryKey } from "./accessibility-summary"

export interface ValidationFixLocation {
  pageId?: string | null
  sectionId?: string | null
  href?: string | null
}

export interface ValidationFixTarget extends ValidationFixLocation {
  stage: ValidationFixStage
}

export type ValidationFixDestination =
  | { kind: "stage"; stage: ValidationFixStage }
  | { kind: "page"; stage: ValidationFixStage; pageId: string; sectionId?: string }

const ACCESSIBILITY_RULE_STAGES: Partial<Record<string, ValidationFixStage>> = {
  "area-alt": "captions",
  "image-alt": "captions",
  "input-image-alt": "captions",
  "object-alt": "captions",
  "role-img-alt": "captions",
  "svg-img-alt": "captions",
  "audio-caption": "speech",
  "video-caption": "speech",
  "heading-order": "sectioning",
  "landmark-one-main": "sectioning",
  "page-has-heading-one": "sectioning",
  "region": "sectioning",
}

const ACCESSIBILITY_CATEGORY_STAGES: Record<AccessibilityCategoryKey, ValidationFixStage> = {
  "text-alternatives": "captions",
  "structure-semantics": "sectioning",
  "keyboard-navigation": "storyboard",
  "forms-controls": "storyboard",
  tables: "sectioning",
  "media-timing": "speech",
  "visual-cues": "storyboard",
  other: "storyboard",
}

const LEGACY_REVIEWER_SECTION_STAGES: Partial<Record<string, ValidationFixStage>> = {
  text: "sectioning",
  "visual-media": "captions",
  audio: "speech",
  "easy-read": "easy-read",
  glossary: "glossary",
  interactivity: "storyboard",
  typography: "storyboard",
  "instructional-content": "sectioning",
  translation: "translate",
  "sign-language": "sign-language",
}

export function resolveAccessibilityFixStage(
  ruleId: string,
  categoryKey: AccessibilityCategoryKey,
): ValidationFixStage {
  return ACCESSIBILITY_RULE_STAGES[ruleId] ?? ACCESSIBILITY_CATEGORY_STAGES[categoryKey]
}

export function resolveReviewerFixStage(
  section: ReviewerValidationSection,
  criterion: ReviewerValidationCriterion,
): ValidationFixStage {
  return criterion.fix_stage
    ?? section.fix_stage
    ?? LEGACY_REVIEWER_SECTION_STAGES[section.id]
    ?? "storyboard"
}

export function deriveSectionIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null
  const pathname = href.split("#", 1)[0].split("?", 1)[0]
  const basename = pathname.split("/").filter(Boolean).at(-1)
  if (!basename) return null
  const match = basename.match(/^(.+_sec\d{3,})\.(?:html|xhtml)$/i)
  return match?.[1] ?? null
}

export function resolveValidationFixDestination(
  target: ValidationFixTarget,
): ValidationFixDestination {
  if (!target.pageId || !hasStagePages(target.stage)) {
    return { kind: "stage", stage: target.stage }
  }

  const sectionId = target.sectionId ?? deriveSectionIdFromHref(target.href)
  const supportsExactSection = target.stage === "sectioning" || target.stage === "storyboard"

  return {
    kind: "page",
    stage: target.stage,
    pageId: target.pageId,
    ...(supportsExactSection && sectionId ? { sectionId } : {}),
  }
}
