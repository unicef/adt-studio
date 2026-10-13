import type { AdtBundleImportPreview, AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"

export const EMPTY_ACTIVITY_REVIEW: AdtBundleImportPreview["activityReview"] = {
  inventoryVersion: null,
  items: [],
  needsReviewCount: 0,
  quizCount: 0,
  activityCount: 0,
  typeOptions: [],
}

export type ImportPhase = "select" | "reading" | "review" | "importing"


export function isReadyImportPreview(preview: AnyImportPreview): boolean {
  if (isAdtBundleImportPreview(preview)) return preview.compatibility.supported
  if (isPartImportPreview(preview)) return true
  return !preview.validationError
}
