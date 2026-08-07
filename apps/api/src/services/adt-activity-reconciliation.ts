import {
  createSafeImportedHtmlPreview,
  inspectImportedActivity,
  KNOWN_ACTIVITY_SECTION_TYPES,
} from "@adt/pipeline"
import {
  AdtActivitySectionType,
  type AdtActivityImportDecision,
} from "@adt/types"

import type { ReadAdtBundle } from "./adt-bundle-reader.js"

export type AdtActivityReviewReason =
  | "missing-declaration"
  | "missing-marker"
  | "type-mismatch"
  | "interactive-unmarked"
  | "invalid-structure"
  | "missing-page"

export interface AdtImportedActivityReviewItem {
  sectionId: string
  href: string
  declaredType: string | null
  detectedType: string | null
  suggestedType: string
  kind: "quiz" | "known" | "custom" | "candidate"
  status: "confirmed" | "needs-review"
  supportsStudioEditing: boolean
  reasons: AdtActivityReviewReason[]
  signals: string[]
  validationErrors: string[]
  textPreview: string
  previewHtml: string
}

export interface AdtImportedActivityReview {
  inventoryVersion: number | null
  items: AdtImportedActivityReviewItem[]
  needsReviewCount: number
  quizCount: number
  activityCount: number
  typeOptions: string[]
}

function activityKind(
  type: string | null,
  hasExplicitClassification: boolean,
): AdtImportedActivityReviewItem["kind"] {
  if (!hasExplicitClassification) return "candidate"
  if (type === "activity_quiz") return "quiz"
  if (type?.startsWith("activity_custom_")) return "custom"
  if (type && (KNOWN_ACTIVITY_SECTION_TYPES as readonly string[]).includes(type)) return "known"
  return "custom"
}

function suggestedType(declaredType: string | null, detectedType: string | null): string {
  return detectedType ?? declaredType ?? "activity_custom_external"
}

/** Reconcile the export-time inventory with the edited HTML. HTML markers are
 * inspected statically and heuristic signals never become activities without
 * an explicit user decision. */
export function analyzeImportedActivities(
  bundle: ReadAdtBundle,
  options: { includePreviews?: boolean } = {},
): AdtImportedActivityReview {
  const declarations = bundle.manifest.editingContract?.activities
  const hasInventory = declarations !== undefined
  const declaredBySection = new Map(
    (declarations ?? []).map((activity) => [activity.sectionId, activity]),
  )
  const seen = new Set<string>()
  const items: AdtImportedActivityReviewItem[] = []

  for (const page of bundle.pages) {
    const declared = declaredBySection.get(page.section_id) ?? null
    if (declared) seen.add(declared.sectionId)
    const inspection = inspectImportedActivity(
      bundle.pageHtml[page.href] ?? "",
      page.section_id,
      { allowSectionDataId: /^(?:qz|quiz)[-_]?\d*/i.test(page.section_id) },
    )
    const detectedType = inspection.isActivity ? inspection.sectionType : null
    if (!declared && !detectedType && inspection.signals.length === 0) continue

    const reasons: AdtActivityReviewReason[] = []
    if (hasInventory && detectedType && !declared) reasons.push("missing-declaration")
    if (declared && !detectedType) reasons.push("missing-marker")
    if (declared && detectedType && declared.type !== detectedType) reasons.push("type-mismatch")
    if (!detectedType && inspection.signals.length > 0) reasons.push("interactive-unmarked")
    if (inspection.validationErrors.length > 0) reasons.push("invalid-structure")

    const type = suggestedType(declared?.type ?? null, detectedType)
    items.push({
      sectionId: page.section_id,
      href: page.href,
      declaredType: declared?.type ?? null,
      detectedType,
      suggestedType: type,
      kind: activityKind(type, Boolean(detectedType || declared)),
      status: reasons.length > 0 ? "needs-review" : "confirmed",
      supportsStudioEditing: inspection.supportsStudioEditing,
      reasons,
      signals: inspection.signals,
      validationErrors: inspection.validationErrors,
      textPreview: inspection.textPreview,
      previewHtml: options.includePreviews
        ? createSafeImportedHtmlPreview(
            bundle.pageHtml[page.href] ?? "",
            page.section_id,
            (assetPath) => {
              const asset = bundle.previewImages?.[assetPath]
              return asset
                ? `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString("base64")}`
                : undefined
            },
          )
        : "",
    })
  }

  for (const declaration of declarations ?? []) {
    if (seen.has(declaration.sectionId)) continue
    items.push({
      sectionId: declaration.sectionId,
      href: declaration.href,
      declaredType: declaration.type,
      detectedType: null,
      suggestedType: declaration.type,
      kind: activityKind(declaration.type, true),
      status: "needs-review",
      supportsStudioEditing: declaration.type === "activity_quiz",
      reasons: ["missing-page"],
      signals: [],
      validationErrors: [],
      textPreview: "",
      previewHtml: "",
    })
  }

  items.sort((left, right) => {
    const leftPage = bundle.pages.findIndex((page) => page.section_id === left.sectionId)
    const rightPage = bundle.pages.findIndex((page) => page.section_id === right.sectionId)
    return leftPage - rightPage || left.sectionId.localeCompare(right.sectionId)
  })
  return {
    inventoryVersion: hasInventory ? 2 : null,
    items,
    needsReviewCount: items.filter((item) => item.status === "needs-review").length,
    quizCount: items.filter((item) => item.suggestedType === "activity_quiz").length,
    activityCount: items.filter((item) => item.suggestedType !== "activity_quiz").length,
    typeOptions: [...KNOWN_ACTIVITY_SECTION_TYPES, "activity_custom_external"],
  }
}

export class AdtActivityReviewError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdtActivityReviewError"
  }
}

/** Validate that every ambiguous section received one explicit decision and
 * return the section-type overrides used by the storyboard projection. */
export function resolveImportedActivityDecisions(
  review: AdtImportedActivityReview,
  decisions: readonly AdtActivityImportDecision[],
): Map<string, string> {
  const required = new Set(
    review.items.filter((item) => item.status === "needs-review").map((item) => item.sectionId),
  )
  const bySection = new Map<string, AdtActivityImportDecision>()
  for (const decision of decisions) {
    if (bySection.has(decision.sectionId)) {
      throw new AdtActivityReviewError(`Duplicate activity decision: ${decision.sectionId}`)
    }
    if (!required.has(decision.sectionId)) {
      throw new AdtActivityReviewError(`Unexpected activity decision: ${decision.sectionId}`)
    }
    if (decision.type !== null && !AdtActivitySectionType.safeParse(decision.type).success) {
      throw new AdtActivityReviewError(`Invalid activity type for ${decision.sectionId}`)
    }
    bySection.set(decision.sectionId, decision)
  }
  const missing = [...required].filter((sectionId) => !bySection.has(sectionId))
  if (missing.length > 0) {
    throw new AdtActivityReviewError(`Review these activities before importing: ${missing.join(", ")}`)
  }
  return new Map(
    [...bySection].map(([sectionId, decision]) => [sectionId, decision.type ?? "content"]),
  )
}
