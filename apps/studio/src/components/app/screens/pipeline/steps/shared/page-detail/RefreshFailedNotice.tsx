import { RotateCcw, TriangleAlert } from "lucide-react"
import { Trans } from "@lingui/react/macro"

export function RefreshFailedNotice({ pageNumber, onRetry }: { pageNumber: number; onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex h-9 items-center gap-2 rounded-lg border border-amber-500/40 bg-card px-3 text-[12px] text-foreground animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none"
    >
      <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
      <span className="min-w-0 flex-1 truncate">
        <Trans>Couldn't refresh page {pageNumber}. You're seeing the last loaded copy.</Trans>
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 font-medium transition-colors hover:bg-muted"
      >
        <RotateCcw aria-hidden className="size-3" />
        <Trans>Try again</Trans>
      </button>
    </div>
  )
}
