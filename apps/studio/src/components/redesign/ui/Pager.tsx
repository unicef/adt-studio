import { ChevronLeft, ChevronRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export interface PagerProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onChange: (page: number) => void
  className?: string
}

/** "Showing a–b of N" summary + numbered page controls. Renders nothing for a single page. */
export function Pager({ page, totalPages, totalItems, pageSize, onChange, className }: PagerProps) {
  if (totalPages <= 1) return null
  const start = totalItems === 0 ? 0 : page * pageSize + 1
  const end = Math.min(totalItems, page * pageSize + pageSize)

  const arrow =
    "grid size-8 place-items-center rounded-md border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="text-xs text-muted-foreground">
        <Trans>
          Showing {start}–{end} of {totalItems} books
        </Trans>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className={arrow} disabled={page === 0} onClick={() => onChange(Math.max(0, page - 1))}>
          <ChevronLeft className="size-3.5" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={cn(
              "h-8 min-w-8 rounded-md border px-2 text-xs font-semibold transition-colors",
              i === page
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          className={arrow}
          disabled={page >= totalPages - 1}
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
