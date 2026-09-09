import { Trans } from "@lingui/react/macro"
import { CheckCheck, Check, Pencil, Send, CircleDashed, type LucideIcon } from "lucide-react"
import type { PageRange, SplitStatus } from "@/api/client"
import type { BookSummary } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type PartStatus = "not-started" | "in-progress" | "shared" | "merged"

export const STATUS_META: Record<PartStatus, { Icon: LucideIcon; iconClass: string; segClass: string }> = {
  merged: { Icon: CheckCheck, iconClass: "text-emerald-600", segClass: "bg-brand-600" },
  "in-progress": { Icon: Pencil, iconClass: "text-amber-600", segClass: "bg-brand-400" },
  shared: { Icon: Send, iconClass: "text-brand-600", segClass: "bg-brand-300" },
  "not-started": { Icon: CircleDashed, iconClass: "text-muted-foreground", segClass: "bg-brand-200" },
}

export function StatusBadge({ status }: { status: PartStatus }) {
  switch (status) {
    case "merged":
      return <Badge variant="success" className="min-w-[124px] justify-center gap-1 px-2 text-[10.5px]"><Check className="size-3" /> <Trans>Merged</Trans></Badge>
    case "in-progress":
      return <Badge variant="warning" className="min-w-[124px] justify-center gap-1 px-2 text-[10.5px]"><Pencil className="size-3" /> <Trans>In progress</Trans></Badge>
    case "shared":
      return <Badge variant="secondary" className="min-w-[124px] justify-center gap-1 bg-brand-600/12 px-2 text-[10.5px] text-brand-700"><Send className="size-3" /> <Trans>Shared</Trans></Badge>
    case "not-started":
      return <Badge variant="secondary" className="min-w-[124px] justify-center gap-1 px-2 text-[10.5px]"><CircleDashed className="size-3" /> <Trans>Not started</Trans></Badge>
  }
}

export interface Segment {
  weight: number
  status: PartStatus
}

export function SegBar({ segments, className }: { segments: Segment[]; className?: string }) {
  return (
    <div className={cn("flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted", className)}>
      {segments.map((s, i) => (
        <div key={i} className={cn("h-full", STATUS_META[s.status].segClass)} style={{ flexGrow: s.weight, flexBasis: 0 }} />
      ))}
    </div>
  )
}

function rangeMerged(r: PageRange, merged: PageRange[]) {
  return merged.some((m) => m.startPage <= r.startPage && m.endPage >= r.endPage)
}

export interface CoordinatorPart {
  range: PageRange
  status: Extract<PartStatus, "shared" | "merged">
}

export function partsOf(status: SplitStatus | undefined): CoordinatorPart[] {
  const exported = status?.exported ?? []
  const mergedRanges = status?.mergedRanges ?? []
  return exported.map((range) => ({ range, status: rangeMerged(range, mergedRanges) ? "merged" : "shared" }))
}

export function segmentsOf(parts: CoordinatorPart[]): Segment[] {
  return parts.map((p) => ({ weight: p.range.endPage - p.range.startPage + 1, status: p.status }))
}

export function fallbackSegments(split: NonNullable<BookSummary["split"]>): Segment[] {
  const shared = Math.max(0, split.splitPages - split.mergedPages)
  const rest = Math.max(0, split.totalPages - split.splitPages)
  return [
    { weight: split.mergedPages, status: "merged" as const },
    { weight: shared, status: "shared" as const },
    { weight: rest, status: "not-started" as const },
  ].filter((s) => s.weight > 0)
}

export function approxMergedParts(split: NonNullable<BookSummary["split"]>): number {
  return split.exportedParts ? Math.round((split.mergedPages / (split.totalPages || 1)) * split.exportedParts) : 0
}
