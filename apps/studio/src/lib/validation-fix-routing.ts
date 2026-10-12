import type {
  ReviewerValidationCriterion,
  ReviewerValidationSection,
  ValidationFixStage,
} from "@adt/types"
import { hasStagePages } from "@/components/pipeline/stage-config"
import type { PageSummaryItem } from "@/api/client"
import type { AccessibilityCategoryKey } from "./accessibility-summary"

export interface ValidationFixLocation {
  pageId?: string | null
  sectionId?: string | null
  href?: string | null
}

export interface ValidationFixTarget extends ValidationFixLocation {
  stage: ValidationFixStage
}

export type ValidationFixDestination = { unavailable?: boolean } & (
  | { kind: "stage"; stage: ValidationFixStage }
  | { kind: "page"; stage: ValidationFixStage; pageId: string; sectionId?: string }
)

const ACCESSIBILITY_RULE_STAGES: Partial<Record<string, ValidationFixStage>> = {
  "area-alt": "captions",
  "image-alt": "captions",
  "input-image-alt": "captions",
  "object-alt": "captions",
  "role-img-alt": "captions",
  "svg-img-alt": "captions",
  "audio-caption": "speech",
  "video-caption": "sign-language",
  "heading-order": "storyboard",
  "landmark-one-main": "storyboard",
  "page-has-heading-one": "storyboard",
  "region": "storyboard",
}

const ACCESSIBILITY_CATEGORY_STAGES: Record<AccessibilityCategoryKey, ValidationFixStage> = {
  "text-alternatives": "captions",
  "structure-semantics": "storyboard",
  "keyboard-navigation": "storyboard",
  "forms-controls": "storyboard",
  tables: "storyboard",
  "media-timing": "speech",
  "visual-cues": "storyboard",
  other: "storyboard",
}

const LEGACY_REVIEWER_SECTION_STAGES: Partial<Record<string, ValidationFixStage>> = {
  "text-extracted-accuracy": "sectioning",
  "visual-media-image-description": "captions",
  "audio-voice-over": "speech",
  "typography-layout-visual-readability": "storyboard",
  "instructional-content-design": "sectioning",
  // Retain aliases for customized catalogs created before fix-stage metadata.
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

function ownStage(stages: Partial<Record<string, ValidationFixStage>>, id: string): ValidationFixStage | undefined {
  return Object.hasOwn(stages, id) ? stages[id] : undefined
}

export function resolveAccessibilityFixStage(
  ruleId: string,
  categoryKey: AccessibilityCategoryKey,
): ValidationFixStage {
  return ownStage(ACCESSIBILITY_RULE_STAGES, ruleId) ?? ownStage(ACCESSIBILITY_CATEGORY_STAGES, categoryKey) ?? "storyboard"
}

export function resolveReviewerFixStage(
  section: ReviewerValidationSection,
  criterion: ReviewerValidationCriterion,
): ValidationFixStage {
  return criterion.fix_stage
    ?? section.fix_stage
    ?? ownStage(LEGACY_REVIEWER_SECTION_STAGES, section.id)
    ?? "storyboard"
}

export function deriveSectionIdFromHref(href: string | null | undefined): string | null {
  if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href) || /[\\%\u0000- ]/.test(href)) return null
  const path = href.split(/[?#]/, 1)[0]
  if (path.split("/").some((part) => !part || part === "." || part === "..")) return null
  const pathname = href.split("#", 1)[0].split("?", 1)[0]
  const basename = pathname.split("/").filter(Boolean).at(-1)
  if (!basename) return null
  const match = basename.match(/^(.+_sec\d{3,})\.(?:html|xhtml)$/i)
  return match?.[1] ?? null
}

export function resolveValidationFixDestination(
  target: ValidationFixTarget,
  pages: Pick<PageSummaryItem, "pageId" | "sections">[],
): ValidationFixDestination {
  const candidate = target.sectionId ?? deriveSectionIdFromHref(target.href)
  const owners = candidate ? pages.flatMap((page) =>
    page.sections.filter((section) => section.sectionId === candidate && section.hasStableId === true && !section.isPruned)
      .map(() => page.pageId),
  ) : []
  // An ID has authority only when there is one active owner. Never use its
  // encoded page prefix or an array index as evidence of current ownership.
  const sectionId = owners.length === 1 ? candidate : null
  const pageId = sectionId ? owners[0] : pages.find((page) => page.pageId === target.pageId)?.pageId
  const unavailable = !!candidate && !sectionId
  if (!pageId || !hasStagePages(target.stage)) {
    return { kind: "stage", stage: target.stage, ...(unavailable ? { unavailable: true } : {}) }
  }
  const supportsExactSection = target.stage === "sectioning" || target.stage === "storyboard"
  return {
    kind: "page", stage: target.stage, pageId,
    ...(supportsExactSection && sectionId ? { sectionId } : {}),
    ...(unavailable ? { unavailable: true } : {}),
  }
}

// Historical default IDs are immutable compatibility data, not active checklist settings.
const HISTORICAL_CRITERION_STAGES: Partial<Record<string, ValidationFixStage>> = {
  "text-matches-original-reading-order": "sectioning",
  "text-does-not-break-illogically": "sectioning",
  "images-match-original-framing": "captions",
  "text-not-in-image-format": "captions",
  "illustrations-remain-consistent": "captions",
  "meaningful-graphics-have-descriptions": "captions",
  "decorative-images-do-not-use-description": "captions",
  "image-description-reflects-purpose-context": "captions",
  "image-description-style-consistent": "captions",
  "audio-available-for-relevant-content": "speech",
  "audio-synchronized-with-highlighted-text": "speech",
  "easy-read-preserves-key-information": "easy-read",
  "easy-read-uses-present-active-voice": "easy-read",
  "numbers-preserved-as-numerals": "easy-read",
  "glossary-includes-relevant-key-terms": "glossary",
  "glossary-links-open-without-issues": "glossary",
  "all-exercises-are-interactive": "storyboard",
  "exercise-instructions-clear-on-page": "storyboard",
  "exercises-provide-feedback": "storyboard",
  "blank-spaces-not-misidentified-as-text": "storyboard",
  "exercise-design-consistent": "storyboard",
  "exercise-answers-not-revealed": "storyboard",
  "design-maintains-learning-flow": "storyboard",
  "font-supports-readability-organization": "storyboard",
  "inclusive-language-used": "sectioning",
  "content-free-of-typos": "sectioning",
  "key-points-summarized": "sectioning",
  "language-appropriate-for-audience": "sectioning",
  "terminology-used-consistently": "sectioning",
  "translation-accurate-fluent-preserves-meaning": "translate",
  "all-text-translated": "translate",
  "translation-preserves-layout-structure": "translate",
  "translation-works-across-devices": "translate",
  "translation-loads-correctly": "translate",
  "signing-movements-visible": "sign-language",
  "background-attire-not-distracting": "sign-language",
  "local-sign-language-used": "sign-language",
  "narrator-visible-with-contrast-lighting": "sign-language",
  "subtitles-reflect-sign-language-meaning": "sign-language",
}

export function resolveLegacyReviewerFixStage(criterionId: string): ValidationFixStage {
  return ownStage(HISTORICAL_CRITERION_STAGES, criterionId) ?? "storyboard"
}
