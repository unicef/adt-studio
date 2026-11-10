import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { rectOf } from "@/components/app/screens/pipeline/steps/shared/page-inspector/pageRect"
import type { ImageBounds, PageSize } from "@/components/app/screens/pipeline/steps/shared/page-inspector/types"
import type { HumanReason, ReasonKind } from "../page-detail/humanReason"

export const RANKING_VERSION = 1

export type Tier = "needed" | "look" | "right"

export const TIER_ORDER: readonly Tier[] = ["needed", "look", "right"]

export const DEFAULT_MIN_SIDE = 50

const NEAR_LIMIT = 0.8
const SQUAT_ASPECT = 3
const STRIP_ASPECT = 6
const BIG_AREA_PCT = 15
const INSIDE_SHARE = 0.85
const INSIDE_GROWTH = 1.2
const REPEAT_MIN_PAGES = 3
const REPEAT_X_STEP = 4

export type Category = "people" | "animal" | "photo" | "diagram" | "drawing" | "ticks" | "text" | "icon"

export const CATEGORY_LABEL: Record<Category, MessageDescriptor> = {
  people: msg`people or characters`,
  animal: msg`an animal`,
  photo: msg`a photo`,
  diagram: msg`a diagram, chart or map`,
  drawing: msg`a drawing`,
  ticks: msg`tick boxes`,
  text: msg`a number or text`,
  icon: msg`an icon or logo`,
}

const STRONG = /\b(illustrat\w*|drawings?|drawn|photo\w*|pictures?|diagrams?|charts?|graphs?|maps?|figures?|person|people|child(?:ren)?|kids?|faces?|characters?|cartoons?|animals?|scenes?|portraits?)\b/gi
const WEAK = /\b(icons?|logos?|stamp\w*|labels? reading|number '?\d|digit|checkbox\w*|text reading)\b/gi
const PIECE = /\b(fragment|partial|cut off)\b/gi
const FLAT = /\b(solid|plain|blank|empty|band|abstract|single colou?r|flat colou?r|mask|silhouette|artifact|shadow|gradient)\b/gi
const NEGATION = /\b(?:no|not|without|nor|neither|rather than|lacks?|any)\b[^.;]{0,60}$/i
const NEGATION_WINDOW = 70

const ENGLISH_WORDS = new Set(["the", "and", "of", "is", "this", "with", "it", "that", "are", "to", "which", "its", "has", "or", "from", "on", "be", "does", "an", "not", "only", "by", "as"])

const CATEGORY_RULES: ReadonlyArray<[Category, RegExp]> = [
  ["people", /^(person|people|child|children|kids?|faces?|characters?|portraits?)$/],
  ["animal", /^animals?$/],
  ["photo", /^photo/],
  ["diagram", /^(diagrams?|charts?|graphs?|maps?|figures?)$/],
  ["drawing", /^(illustrat|drawings?$|drawn$|pictures?$|cartoons?$|scenes?$)/],
  ["ticks", /^checkbox/],
  ["text", /^(labels? reading|number|digit|text reading)/],
  ["icon", /^(icons?|logos?|stamp)/],
]

const MIN_SIDE = /min_side (\d+)px/i
const SHORT_SIDE = /shortest side (\d+)px/i

export interface TierInput {
  key?: string
  pageId: string
  reason: Pick<HumanReason, "kind" | "detail" | "raw">
  width?: number
  height?: number
  bounds?: ImageBounds
}

export interface RepeatInfo {
  key: string
  count: number
  pages: number
}

export interface RepeatGroup {
  key: string
  keys: string[]
  pageIds: string[]
}

export type RepeatIndex = ReadonlyMap<string, RepeatGroup>

export interface TierContext {
  pageSize: PageSize | null
  kept: readonly ImageBounds[]
  repeats?: RepeatIndex
}

export interface TierSignals {
  areaPct: number | null
  aspect: number | null
  side: number | null
  minSide: number
  insideKept: boolean
  english: boolean
  words: string[]
  repeat: RepeatInfo | null
}

export interface TierResult {
  tier: Tier | null
  why: MessageDescriptor | null
  category: Category | null
  signals: TierSignals
  repeatKey: string | null
}

export function keywordHits(text: string, pattern: RegExp): string[] {
  const hits: string[] = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    const before = text.slice(Math.max(0, start - NEGATION_WINDOW), start)
    if (!NEGATION.test(before)) hits.push(match[0].toLowerCase())
  }
  return hits
}

export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? []
  if (words.length === 0) return false
  let hits = 0
  for (const word of words) if (ENGLISH_WORDS.has(word)) hits++
  return hits >= 2 && hits / words.length >= 0.06
}

export function categoryOf(words: readonly string[]): Category | null {
  for (const [category, rule] of CATEGORY_RULES) if (words.some((word) => rule.test(word))) return category
  return null
}

function boundsArea(bounds: ImageBounds): number {
  return bounds.width * bounds.height
}

export function insideKept(bounds: ImageBounds | undefined, kept: readonly ImageBounds[]): boolean {
  if (!bounds) return false
  const area = boundsArea(bounds)
  if (!(area > 0)) return false
  return kept.some((other) => {
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, other.x + other.width) - Math.max(bounds.x, other.x))
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, other.y + other.height) - Math.max(bounds.y, other.y))
    return overlapX * overlapY >= INSIDE_SHARE * area && boundsArea(other) >= INSIDE_GROWTH * area
  })
}

export function areaPctOf(bounds: ImageBounds | undefined, pageSize: PageSize | null): number | null {
  if (!bounds || !pageSize || !(pageSize.w > 0) || !(pageSize.h > 0)) return null
  const rect = rectOf({ imageId: "", number: 0, bounds }, pageSize)
  return rect ? (rect.width * rect.height) / 100 : null
}

function aspectOf(item: TierInput): number | null {
  const [a, b] = item.bounds ? [item.bounds.width, item.bounds.height] : item.width && item.height ? [item.width, item.height] : [0, 0]
  if (!(a > 0) || !(b > 0)) return null
  return Math.max(a, b) / Math.min(a, b)
}

function sideOf(item: TierInput): number | null {
  if (item.width && item.height) return Math.min(item.width, item.height)
  const parsed = SHORT_SIDE.exec(item.reason.raw ?? "")
  return parsed ? Number(parsed[1]) : null
}

function minSideOf(item: TierInput): number {
  const parsed = MIN_SIDE.exec(item.reason.raw ?? "")
  return parsed ? Number(parsed[1]) : DEFAULT_MIN_SIDE
}

export function repeatSignature(item: TierInput): string | null {
  if (!item.bounds || !item.width || !item.height) return null
  return [item.reason.kind, item.width, item.height, Math.round(item.bounds.x / REPEAT_X_STEP)].join(":")
}

export function itemKey(item: TierInput & { imageId?: string }): string {
  return item.key ?? `${item.pageId}/${item.imageId ?? ""}`
}

export function buildRepeatIndex(items: ReadonlyArray<TierInput & { imageId?: string }>): Map<string, RepeatGroup> {
  const groups = new Map<string, RepeatGroup>()
  for (const item of items) {
    const signature = repeatSignature(item)
    if (!signature) continue
    const group = groups.get(signature) ?? { key: signature, keys: [], pageIds: [] }
    group.keys.push(itemKey(item))
    if (!group.pageIds.includes(item.pageId)) group.pageIds.push(item.pageId)
    groups.set(signature, group)
  }
  for (const [signature, group] of groups) if (group.pageIds.length < REPEAT_MIN_PAGES) groups.delete(signature)
  return groups
}

function result(tier: Tier | null, why: MessageDescriptor | null, signals: TierSignals, repeatKey: string | null, category: Category | null = null): TierResult {
  return { tier, why, category, signals, repeatKey }
}

const ALWAYS_RIGHT: Partial<Record<ReasonKind, MessageDescriptor>> = {
  blank: msg`One flat colour, nothing to see`,
  "full-page": msg`A picture of the whole page`,
  segmented: msg`Its parts are kept`,
  cropped: msg`A cropped version is kept`,
  duplicate: msg`A copy is kept inside a bigger figure`,
}

export function tierOf(item: TierInput, ctx: TierContext): TierResult {
  const kind = item.reason.kind
  const text = item.reason.detail ?? ""
  const english = text !== "" && looksEnglish(text)
  const keywords = english && (kind === "not-meaningful" || kind === "page-elements")
  const strong = keywords ? keywordHits(text, STRONG) : []
  const weak = keywords ? keywordHits(text, WEAK) : []
  const piece = keywords ? keywordHits(text, PIECE) : []
  const flat = keywords ? keywordHits(text, FLAT) : []
  const signature = repeatSignature(item)
  const group = signature ? ctx.repeats?.get(signature) : undefined
  const signals: TierSignals = {
    areaPct: areaPctOf(item.bounds, ctx.pageSize),
    aspect: aspectOf(item),
    side: sideOf(item),
    minSide: minSideOf(item),
    insideKept: insideKept(item.bounds, ctx.kept),
    english,
    words: [...new Set([...strong, ...weak, ...piece, ...flat])],
    repeat: group ? { key: group.key, count: group.keys.length, pages: group.pageIds.length } : null,
  }
  const repeatKey = group?.key ?? null
  const fixed = ALWAYS_RIGHT[kind]
  if (fixed) return result("right", fixed, signals, repeatKey)
  if (kind === "manual" || kind === "guard-kept") return result(null, null, signals, repeatKey)
  const aspect = signals.aspect ?? 1

  if (kind === "too-small") {
    if (signals.insideKept) return result("right", msg`It sits inside a picture that is kept`, signals, repeatKey)
    const side = signals.side
    const min = signals.minSide
    if (side !== null && side >= NEAR_LIMIT * min && aspect <= SQUAT_ASPECT) return result("look", msg`Only just under the size limit (${side} of ${min} px)`, signals, repeatKey)
    return result("right", msg`A tiny dot or thin line`, signals, repeatKey)
  }

  if (kind === "too-large") return result("look", msg`Very big. Check it isn't a full illustration`, signals, repeatKey)

  if (kind === "not-meaningful") {
    if (signals.insideKept) return result("right", msg`It sits inside a picture that is kept`, signals, repeatKey)
    if (aspect >= STRIP_ASPECT) return result("right", msg`A thin bar or strip, like a heading background`, signals, repeatKey)
    if (piece.length > 0) return result("look", msg`Looks like a piece of a bigger picture. Check the whole one is kept`, signals, repeatKey)
    if (strong.length > 0 && flat.length === 0) {
      const category = categoryOf(strong) ?? "drawing"
      return result("needed", msg`The AI itself describes it as ${category}`, signals, repeatKey, category)
    }
    if (strong.length > 0 || weak.length > 0) {
      const category = categoryOf(strong) ?? categoryOf(weak) ?? "drawing"
      return result("look", msg`The AI mentions ${category}. Check it isn't lesson content`, signals, repeatKey, category)
    }
    if (flat.length > 0) return result("right", msg`The AI saw only a plain shape`, signals, repeatKey)
    if (signals.areaPct !== null && signals.areaPct >= BIG_AREA_PCT) {
      const n = Math.round(signals.areaPct)
      return result("look", msg`Big: covers ${n}% of the page`, signals, repeatKey)
    }
    return result("right", msg`The AI judged it decoration`, signals, repeatKey)
  }

  if (kind === "page-elements") {
    if (strong.length > 0) {
      const category = categoryOf(strong) ?? "drawing"
      return result("needed", msg`Rebuilt as text, but the AI says it shows ${category}`, signals, repeatKey, category)
    }
    return result("look", msg`It will be rebuilt as text or a table. Keep it if the picture matters`, signals, repeatKey)
  }

  return result("look", msg`The reason is unclear. Have a look`, signals, repeatKey)
}

export function whyText(translate: (descriptor: MessageDescriptor) => string, rank: Pick<TierResult, "why" | "category"> | null | undefined): string {
  if (!rank?.why) return ""
  if (!rank.category) return translate(rank.why)
  return translate({ ...rank.why, values: { ...rank.why.values, category: translate(CATEGORY_LABEL[rank.category]) } })
}

export function tierRank(tier: Tier | null): number {
  return tier === null ? TIER_ORDER.length : TIER_ORDER.indexOf(tier)
}

export interface RankedPosition {
  pageNumber: number
  number: number
}

export function compareRanked<T extends RankedPosition>(rankOf: (item: T) => Tier | null) {
  return (a: T, b: T) => tierRank(rankOf(a)) - tierRank(rankOf(b)) || a.pageNumber - b.pageNumber || a.number - b.number
}

export interface KindCount {
  kind: ReasonKind
  count: number
}

export interface TierSplit<T> {
  needed: T[]
  look: T[]
  right: T[]
  unranked: T[]
  rightKinds: KindCount[]
}

function countKinds(items: ReadonlyArray<{ reason: { kind: ReasonKind } }>): KindCount[] {
  const counts = new Map<ReasonKind, number>()
  for (const item of items) counts.set(item.reason.kind, (counts.get(item.reason.kind) ?? 0) + 1)
  return [...counts.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count)
}

export function splitTiers<T extends { reason: { kind: ReasonKind } }>(items: readonly T[], tierOfItem: (item: T) => Tier | null): TierSplit<T> {
  const split: TierSplit<T> = { needed: [], look: [], right: [], unranked: [], rightKinds: [] }
  for (const item of items) {
    const tier = tierOfItem(item)
    if (tier === null) split.unranked.push(item)
    else split[tier].push(item)
  }
  split.rightKinds = countKinds(split.right)
  return split
}

export function isAiJudged(kind: ReasonKind): boolean {
  return kind === "page-elements" || kind === "not-meaningful"
}
