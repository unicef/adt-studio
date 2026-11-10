import type { TranslationEvaluationStatusResponse } from "@/api/client"

export type ReviewItem = NonNullable<
  NonNullable<TranslationEvaluationStatusResponse["evaluation"]>["items"][number]
>

export type ReviewFilter = "all" | "needs-attention" | "acceptable" | "accepted-anyway"

export interface ReviewCounts {
  total: number
  needsAttention: number
  acceptable: number
  acceptedAnyway: number
}

export function needsAttention(item: ReviewItem): boolean {
  return !item.acceptable && !item.accepted_anyway
}

/**
 * Review results that still describe the text on screen: an item whose source
 * or translation changed since the review no longer applies, and a stale or
 * partly failed review is not trusted at all.
 */
export function currentReviewItems(
  status: TranslationEvaluationStatusResponse | null | undefined,
  scopeIds: readonly string[],
  sourceById: ReadonlyMap<string, string>,
  targetById: ReadonlyMap<string, string>,
): Map<string, ReviewItem> {
  const map = new Map<string, ReviewItem>()
  const evaluation = status?.evaluation
  if (!evaluation || status.isStale || (evaluation.metadata?.failed_pages ?? 0) > 0) return map
  const visible = new Set(scopeIds)
  const selected = evaluation.metadata?.selected_entry_ids
  if (selected && !selected.some((id) => visible.has(id))) return map
  for (const item of evaluation.items) {
    if (!visible.has(item.entry_id)) continue
    if (item.source_text !== undefined && item.source_text !== sourceById.get(item.entry_id)) continue
    if (item.translated_text !== undefined && item.translated_text !== targetById.get(item.entry_id)) continue
    map.set(item.entry_id, item)
  }
  return map
}

export function countReview(items: ReadonlyMap<string, ReviewItem>): ReviewCounts {
  const counts: ReviewCounts = { total: 0, needsAttention: 0, acceptable: 0, acceptedAnyway: 0 }
  for (const item of items.values()) {
    counts.total += 1
    if (item.acceptable) counts.acceptable += 1
    else if (item.accepted_anyway) counts.acceptedAnyway += 1
    else counts.needsAttention += 1
  }
  return counts
}

export function matchesReviewFilter(item: ReviewItem | undefined, filter: ReviewFilter): boolean {
  if (filter === "all") return true
  if (!item) return false
  if (filter === "acceptable") return item.acceptable
  if (filter === "accepted-anyway") return !item.acceptable && item.accepted_anyway === true
  return needsAttention(item)
}
