import { Trans, useLingui } from "@lingui/react/macro"
import type { PageSummaryItem } from "@/api/client"
import { PlaceholderFrame } from "./PlaceholderFrame"
import { PlaceholderPanel } from "./PlaceholderPanel"
import { SkeletonBar } from "./SkeletonBar"

export function PageDetailPlaceholder({
  label,
  pageId,
  pageNumber,
  ratio,
  summary,
  pageSrc,
}: {
  label: string
  pageId: string
  pageNumber: number
  ratio: number
  summary: PageSummaryItem | null
  pageSrc: string | null
}) {
  const { t } = useLingui()
  const size = summary?.pageWidth && summary.pageHeight ? { w: summary.pageWidth, h: summary.pageHeight } : null
  return (
    <div role="status" aria-busy className="contents">
      <span className="sr-only">
        <Trans>Loading page…</Trans>
      </span>
      {summary ? (
        <p className="-mt-2 shrink-0 font-mono text-[11px] text-muted-foreground/80">
          {size ? t`${pageId} · page image ${size.w} × ${size.h}` : pageId}
        </p>
      ) : (
        <span aria-hidden className="-mt-2 flex h-[1lh] shrink-0 items-center text-[11px]">
          <SkeletonBar className="h-2.5 w-56" />
        </span>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,26%)]">
        <div className="relative flex min-h-[420px] min-w-0 items-start justify-center [container-type:size] lg:min-h-0">
          <PlaceholderFrame label={label} pageId={pageId} ratio={ratio} pageSrc={summary ? pageSrc : null} size={size} pageNumber={pageNumber} />
        </div>
        <PlaceholderPanel summary={summary} />
      </div>
    </div>
  )
}
