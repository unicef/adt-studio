import type { Tier, TierResult } from "../tier"
import type { FilteredImage } from "../useFilteredImages"

export type CardVerdict = "keep" | "unsure" | "remove"

export interface RankedItem {
  item: FilteredImage
  rank: TierResult
}

export interface CardLeftOut {
  pageNumber: number
  loading: boolean
  pending: number
  open: Record<Tier, RankedItem[]>
  reviewed: boolean
  showAll: boolean
  kept: number
  aiAsked: boolean
  aiKeep: number
  aiRunning: boolean
  label: string
  checks: Array<{ item: FilteredImage; verdict: CardVerdict | null }>
  ai: Record<CardVerdict, number>
  onReview: (tier: Tier) => void
  onOpenItem: (item: FilteredImage) => void
}

export function visibleTiers(leftOut: CardLeftOut): Tier[] {
  const tiers: Tier[] = []
  if (leftOut.open.needed.length > 0) tiers.push("needed")
  if (leftOut.open.look.length > 0) tiers.push("look")
  if (leftOut.showAll && leftOut.open.right.length > 0) tiers.push("right")
  return tiers
}

export function hasCardContent(leftOut: CardLeftOut | undefined): leftOut is CardLeftOut {
  if (!leftOut) return false
  if (leftOut.loading) return leftOut.pending > 0
  return visibleTiers(leftOut).length > 0 || leftOut.reviewed
}
