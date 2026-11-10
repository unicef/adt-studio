import { TIER_ORDER, type Tier, type TierSignals } from "../tier"
import type { Verdict } from "./judgeStore"

export const AI_TEXT_LIMIT = 200

export interface ReportEntry {
  imageId: string
  pageNumber: number
  number: number
  width?: number
  height?: number
  reason: string
  aiText: string | null
  tier: Tier | null
  why: string
  signals: string
  group: ReportGroup | null
  verdict: Verdict | null
  comment: string
  gone: boolean
  outside?: boolean
  second?: { verdict: "keep" | "remove" | "unsure"; text: string } | null
}

export interface ReportGroup {
  key: string
  title: string
}

export interface ReportCounts {
  judged: number
  total: number
  right: number
  wrong: number
  open: number
}

export interface TierCounts {
  needed: number
  look: number
  right: number
}

export interface ReportCopy {
  title: (book: string, date: string) => string
  ranking: (version: number, totals: TierCounts) => string
  summary: (counts: ReportCounts) => string
  tierHeading: (tier: Tier, count: number, judged: number, wrong: number) => string
  openHeading: (count: number) => string
  unranked: string
  image: (page: number, number: number) => string
  why: string
  signals: string
  ai: string
  comment: string
  verdict: Record<Verdict, string>
  gone: string
  second?: string
  secondSummary?: (counts: { keep: number; remove: number; unsure: number; judged: number; agree: number }) => string
}

export interface SignalCopy {
  area: (pct: string) => string
  ratio: (value: string) => string
  side: (side: number, min: number) => string
  inside: string
  words: (list: string) => string
  repeat: (count: number, pages: number) => string
  notEnglish: string
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export function trimText(text: string, limit = AI_TEXT_LIMIT): string {
  const flat = oneLine(text)
  if (flat.length <= limit) return flat
  const cut = flat.slice(0, limit)
  const space = cut.lastIndexOf(" ")
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, "")}…`
}

function round(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)))
}

export function signalText(signals: TierSignals, kindIsSmall: boolean, copy: SignalCopy): string {
  const parts: string[] = []
  if (signals.areaPct !== null) parts.push(copy.area(round(signals.areaPct, signals.areaPct < 1 ? 2 : 1)))
  if (signals.aspect !== null) parts.push(copy.ratio(round(signals.aspect, 1)))
  if (kindIsSmall && signals.side !== null) parts.push(copy.side(signals.side, signals.minSide))
  if (signals.insideKept) parts.push(copy.inside)
  if (signals.words.length > 0) parts.push(copy.words(signals.words.join(", ")))
  if (signals.repeat) parts.push(copy.repeat(signals.repeat.count, signals.repeat.pages))
  if (!signals.english && signals.words.length === 0 && !kindIsSmall) parts.push(copy.notEnglish)
  return parts.join(", ")
}

function byPosition(a: ReportEntry, b: ReportEntry): number {
  return a.pageNumber - b.pageNumber || a.number - b.number || a.imageId.localeCompare(b.imageId)
}

export function reportCounts(entries: readonly ReportEntry[]): ReportCounts {
  let right = 0
  let wrong = 0
  for (const entry of entries) {
    if (entry.verdict === "right") right++
    else if (entry.verdict === "wrong") wrong++
  }
  const judged = right + wrong
  return { judged, total: entries.length, right, wrong, open: entries.length - judged }
}

function suffix(entry: ReportEntry, copy: ReportCopy): string {
  const verdict = entry.verdict ? ` · **${copy.verdict[entry.verdict]}**` : ""
  const comment = entry.comment.trim() ? ` · ${copy.comment}: ${oneLine(entry.comment)}` : ""
  const gone = entry.gone ? ` _(${copy.gone})_` : ""
  return `${verdict}${comment}${gone}`
}

function entryLine(entry: ReportEntry, copy: ReportCopy): string {
  const size = entry.width && entry.height ? `, ${entry.width}×${entry.height}` : ""
  const why = entry.why ? ` · ${copy.why}: ${entry.why}` : ""
  const signals = entry.signals ? ` · ${copy.signals}: ${entry.signals}` : ""
  const ai = entry.aiText ? ` · ${copy.ai}: "${trimText(entry.aiText)}"` : ""
  const second = entry.second && copy.second ? ` · ${copy.second}: ${entry.second.text}` : ""
  return `- **${copy.image(entry.pageNumber, entry.number)}** (\`${entry.imageId}\`${size}) · ${entry.reason}${why}${signals}${ai}${second}${suffix(entry, copy)}`
}

function groupLine(group: ReportGroup, members: readonly ReportEntry[], copy: ReportCopy, heading: boolean): string {
  const ids = members.map((entry) => entry.imageId).join(", ")
  const lead = members[0]
  const verdicts = new Set(members.map((entry) => entry.verdict))
  const shared = verdicts.size === 1 ? lead : { ...lead, verdict: null }
  return `${heading ? "### " : "- "}${group.title}: ${ids}${suffix({ ...shared, gone: members.every((entry) => entry.gone) }, copy)}`
}

function linesOf(entries: readonly ReportEntry[], copy: ReportCopy, heading: boolean): string[] {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!entry.group) {
      lines.push(entryLine(entry, copy))
      continue
    }
    if (seen.has(entry.group.key)) continue
    seen.add(entry.group.key)
    const members = entries.filter((other) => other.group?.key === entry.group?.key)
    if (members.length === 1) lines.push(entryLine(entry, copy))
    else lines.push(groupLine(entry.group, members, copy, heading))
  }
  return lines
}

export function buildJudgeReport({
  book,
  date,
  version,
  totals,
  entries,
  copy,
}: {
  book: string
  date: string
  version: number
  totals: TierCounts
  entries: readonly ReportEntry[]
  copy: ReportCopy
}): string {
  const sorted = [...entries].sort(byPosition)
  const counts = reportCounts(sorted.filter((entry) => !entry.outside))
  const lines = [`# ${copy.title(book, date)}`, copy.ranking(version, totals), copy.summary(counts)]
  const withSecond = sorted.filter((entry) => !entry.outside && entry.second)
  if (withSecond.length > 0 && copy.secondSummary) {
    const tally = { keep: 0, remove: 0, unsure: 0, judged: 0, agree: 0 }
    for (const entry of withSecond) {
      const verdict = entry.second?.verdict
      if (!verdict) continue
      tally[verdict]++
      if (entry.verdict && verdict !== "unsure") {
        tally.judged++
        if ((entry.verdict === "wrong") === (verdict === "keep")) tally.agree++
      }
    }
    lines.push(copy.secondSummary(tally))
  }
  for (const tier of TIER_ORDER) {
    const inTier = sorted.filter((entry) => entry.tier === tier)
    const judged = inTier.filter((entry) => entry.verdict !== null)
    const wrong = judged.filter((entry) => entry.verdict === "wrong").length
    lines.push("", `## ${copy.tierHeading(tier, totals[tier], judged.length, wrong)}`, ...linesOf(judged, copy, true))
  }
  const unranked = sorted.filter((entry) => entry.tier === null && entry.verdict !== null)
  if (unranked.length > 0) lines.push("", `## ${copy.unranked} (${unranked.length})`, ...linesOf(unranked, copy, true))
  const open = sorted.filter((entry) => entry.verdict === null)
  if (open.length > 0) lines.push("", `## ${copy.openHeading(open.length)}`, ...linesOf(open, copy, false))
  return lines.join("\n") + "\n"
}

export function localDate(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
