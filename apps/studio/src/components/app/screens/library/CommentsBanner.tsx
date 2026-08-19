import { ArrowRight } from "lucide-react"
import { Trans, Plural } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ReviewComment {
  author: string
  text?: string
  page?: number
  ago?: string
}

const PRESS = "transition-transform active:scale-[0.98]"

const PALETTE = ["#e0567a", "#4f7bd6", "#3fae86", "#d98a3d", "#8b6fd0", "#3fa7ae"]

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

function colorOf(name: string): string {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return PALETTE[sum % PALETTE.length]
}

export function CommentsBannerAvatars({ comments, onReview }: { comments: ReviewComment[]; onReview: () => void }) {
  const reviewers = new Set(comments.map((c) => c.author)).size
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-500/25 bg-brand-500/[0.07] px-3.5 py-3">
      <div className="flex -space-x-2">
        {comments.slice(0, 3).map((c, i) => (
          <span
            key={i}
            className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-background"
            style={{ background: colorOf(c.author) }}
          >
            {initialsOf(c.author)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1 text-[13px] leading-tight">
        <div className="font-semibold text-foreground">
          <Plural value={comments.length} one="# comment to review" other="# comments to review" />
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          <Plural value={reviewers} one="from # reviewer" other="from # reviewers" />
        </div>
      </div>
      <Button size="sm" onClick={onReview} className={cn(PRESS, "shrink-0 bg-brand-600 text-primary-foreground hover:bg-brand-700")}>
        <Trans>Review</Trans>
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  )
}
