import { memo, useId, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { PAGE_CARD_INTERACTIVE } from "./pageCard"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { StatusDot } from "./StatusDot"

export interface StepPageStat {
  key: string
  icon: React.ComponentType<{ className?: string }>
  value: ReactNode
  label: string
  tone?: "default" | "attention" | "danger"
}

export interface StepPageCardProps {
  label: string
  pageId: string
  pageNumber: number
  onOpen: (pageId: string) => void
  aspect: number
  fit: "cover" | "contain"
  stats?: readonly StepPageStat[]
  status?: ReactNode
  preview?: ReactNode
  failed?: boolean
  waiting?: boolean
  selected?: boolean
}

const STAT_TONE = {
  default: "text-muted-foreground",
  attention: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
}

export const StepPageCard = memo(function StepPageCard({
  label,
  pageId,
  pageNumber,
  onOpen,
  aspect,
  fit,
  stats = [],
  status,
  preview,
  failed = false,
  waiting = false,
  selected = false,
}: StepPageCardProps) {
  const { t } = useLingui()
  const detailsId = useId()
  return (
    <button
      type="button"
      onClick={() => onOpen(pageId)}
      disabled={waiting}
      aria-busy={waiting || undefined}
      aria-pressed={selected || undefined}
      data-page-card={pageId}
      aria-label={t`Open page ${pageNumber}`}
      aria-describedby={detailsId}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left",
        failed && "border-destructive/40",
        selected && "border-[color-mix(in_srgb,var(--chrome-hex)_55%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex)_18%,transparent)]",
        waiting ? "cursor-default opacity-70 transition-opacity duration-300 motion-reduce:transition-none [&_img]:grayscale" : PAGE_CARD_INTERACTIVE,
      )}
    >
      <PageThumb
        label={label}
        pageId={pageId}
        sectionIndex={null}
        className="w-full rounded-none border-0 border-b"
        style={{ aspectRatio: aspect }}
        fit={fit}
      />
      <div id={detailsId} className="flex flex-col gap-0.5 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[12px] font-medium">
            <Trans>Page {pageNumber}</Trans>
          </span>
          <div className="flex items-center gap-2">
            {stats.slice(0, 3).map((stat) => (
              <span
                key={stat.key}
                title={stat.label}
                aria-label={stat.label}
                className={cn("flex items-center gap-0.5 font-mono text-[10px] tabular-nums", STAT_TONE[stat.tone ?? "default"])}
              >
                <stat.icon className="size-2.5" />
                {stat.value}
              </span>
            ))}
            {failed ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                <StatusDot tone="failed" label={t`Not done`} />
                <Trans>Not done</Trans>
              </span>
            ) : (
              status
            )}
          </div>
        </div>
        {waiting ? (
          <span aria-hidden className="flex min-h-[2lh] flex-col justify-center gap-1.5 text-[11px] leading-relaxed">
            <span className="block h-2 w-11/12 rounded bg-muted-foreground/15 motion-safe:animate-pulse" />
            <span className="block h-2 w-2/3 rounded bg-muted-foreground/15 motion-safe:animate-pulse" />
          </span>
        ) : (
          preview !== undefined && <p className="line-clamp-2 min-h-[2lh] text-[11px] leading-relaxed text-muted-foreground">{preview}</p>
        )}
      </div>
    </button>
  )
})
