import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PageSummaryItem } from "@/api/client"
import { INSPECTOR_GRID, INSPECTOR_PAGE_CARD, INSPECTOR_PAGE_CELL, InspectorInfoLine } from "../layout"
import { PlaceholderFrame } from "./PlaceholderFrame"
import { SkeletonBar } from "./SkeletonBar"

export type PlaceholderPanelRenderer = (summary: PageSummaryItem | null) => ReactNode

export function PageDetailPlaceholder({
  label,
  pageId,
  pageNumber,
  ratio,
  summary,
  pageSrc,
  panel,
  info,
}: {
  label: string
  pageId: string
  pageNumber: number
  ratio: number
  summary: PageSummaryItem | null
  pageSrc: string | null
  panel: PlaceholderPanelRenderer
  info?: (summary: PageSummaryItem) => ReactNode
}) {
  const { t } = useLingui()
  const size = summary?.pageWidth && summary.pageHeight ? { w: summary.pageWidth, h: summary.pageHeight } : null
  return (
    <div role="status" aria-busy className="contents">
      <span className="sr-only">
        <Trans>Loading page…</Trans>
      </span>
      {summary ? (
        <InspectorInfoLine>{info ? info(summary) : size ? t`${pageId} · page image ${size.w} × ${size.h}` : pageId}</InspectorInfoLine>
      ) : (
        <span aria-hidden className="-mt-2 flex h-[1lh] shrink-0 items-center text-[11px]">
          <SkeletonBar className="h-2.5 w-56" />
        </span>
      )}
      <div className={INSPECTOR_GRID}>
        <div className={INSPECTOR_PAGE_CELL}>
          <div className={INSPECTOR_PAGE_CARD}>
            <PlaceholderFrame label={label} pageId={pageId} ratio={ratio} pageSrc={summary ? pageSrc : null} size={size} pageNumber={pageNumber} />
          </div>
        </div>
        {panel(summary)}
      </div>
    </div>
  )
}
