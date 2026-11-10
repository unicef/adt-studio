import { buildRepeatIndex, compareRanked, tierOf, type RepeatIndex, type Tier, type TierResult } from "./tier"
import type { FilteredImage, PageTierContext } from "./useFilteredImages"

export type Ranks = ReadonlyMap<string, TierResult>

export interface Ranking {
  ranks: Ranks
  repeats: RepeatIndex
}

export function rankItems(items: readonly FilteredImage[], contexts: ReadonlyMap<string, PageTierContext>): Ranking {
  const repeats = buildRepeatIndex(items)
  const ranks = new Map<string, TierResult>()
  for (const item of items) {
    const context = contexts.get(item.pageId)
    ranks.set(item.key, tierOf(item, { pageSize: context?.pageSize ?? item.pageSize, kept: context?.kept ?? [], repeats }))
  }
  return { ranks, repeats }
}

export function tierFrom(ranks: Ranks) {
  return (item: FilteredImage): Tier | null => ranks.get(item.key)?.tier ?? null
}

export function sortByTier(items: readonly FilteredImage[], ranks: Ranks): FilteredImage[] {
  return [...items].sort(compareRanked(tierFrom(ranks)))
}

export interface ReviewStep {
  key: string
  lead: FilteredImage
  items: FilteredImage[]
  tier: Tier | null
  group: { key: string; count: number; pages: number } | null
}

export function buildSteps(list: readonly FilteredImage[], ranks: Ranks): ReviewStep[] {
  const members = new Map<string, FilteredImage[]>()
  for (const item of list) {
    const repeatKey = ranks.get(item.key)?.repeatKey
    if (repeatKey) members.set(repeatKey, [...(members.get(repeatKey) ?? []), item])
  }
  const steps: ReviewStep[] = []
  const placed = new Set<string>()
  for (const item of list) {
    const rank = ranks.get(item.key)
    const repeatKey = rank?.repeatKey
    const group = repeatKey ? members.get(repeatKey) : undefined
    if (repeatKey && group && group.length > 1) {
      if (placed.has(repeatKey)) continue
      placed.add(repeatKey)
      steps.push({
        key: `group:${repeatKey}`,
        lead: group[0],
        items: group,
        tier: rank?.tier ?? null,
        group: { key: repeatKey, count: group.length, pages: new Set(group.map((entry) => entry.pageId)).size },
      })
      continue
    }
    steps.push({ key: item.key, lead: item, items: [item], tier: rank?.tier ?? null, group: null })
  }
  return steps
}

export function stepIndexOf(steps: readonly ReviewStep[], key: string | null): number {
  if (!key) return -1
  return steps.findIndex((step) => step.key === key || step.items.some((item) => item.key === key))
}
