import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, Check, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PageReview } from "./usePageReview"

export function PageDone({ review, compact = false, className }: { review: PageReview; compact?: boolean; className?: string }) {
  const { t } = useLingui()
  const next = review.nextPage
  return (
    <div className={cn("flex items-center gap-3 animate-in fade-in duration-200 motion-reduce:animate-none", compact ? "flex-row" : "flex-col items-stretch", className)} data-left-out-bar="page-done">
      <p className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--chrome-hex)] text-white">
          <Check className="size-3.5" aria-hidden />
        </span>
        {review.empty ? t`Nothing on this page needs a look` : t`This page is checked`}
      </p>
      <div className={cn("flex items-center gap-1.5", !compact && "flex-col items-stretch")}>
        {!review.empty && (
          <button type="button" onClick={review.reopen} className="flex h-8 items-center justify-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <RotateCcw className="size-3" aria-hidden />
            <Trans>Look again</Trans>
          </button>
        )}
        <button
          type="button"
          onClick={review.goNextPage}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--chrome-hex)] px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {next ? t`Next: page ${next.pageNumber}` : t`All pages checked`}
          {next && <ArrowRight className="size-3.5" aria-hidden />}
        </button>
      </div>
    </div>
  )
}
