import { CONSISTENCY_REVIEW } from "./data.consistency"
import { CONTRAST_REVIEW } from "./data.contrast"
import { CODE_REVIEW } from "./data.code"
import type { Review } from "./types"

export const REVIEWS: Review[] = [CONSISTENCY_REVIEW, CONTRAST_REVIEW, CODE_REVIEW]

export const REVIEW_META = {
  branch: "eliezir/import-prototype-sidebar",
  shots: "18 renders, 9 surfaces × 2 themes",
}
