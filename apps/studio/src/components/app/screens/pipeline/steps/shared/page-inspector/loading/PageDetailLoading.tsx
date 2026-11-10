import type { ReactNode } from "react"
import type { PageSummaryItem } from "@/api/client"
import { usePages } from "@/hooks/use-pages"
import { expectedRunRatio, isSpreadPageId } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { LoadSwap } from "./LoadSwap"
import { PageDetailPlaceholder, type PlaceholderPanelRenderer } from "./PageDetailPlaceholder"

export function PageDetailLoading({
  label,
  pageId,
  pageNumber,
  ready,
  pageSrc,
  panel,
  info,
  children,
}: {
  label: string
  pageId: string
  pageNumber: number
  ready: boolean
  pageSrc: string | null
  panel: PlaceholderPanelRenderer
  info?: (summary: PageSummaryItem) => ReactNode
  children: ReactNode
}) {
  const pages = usePages(label, { enabled: false })
  const summary = pages.data?.find((page) => page.pageId === pageId) ?? null
  const known = summary?.pageWidth && summary.pageHeight ? summary.pageWidth / summary.pageHeight : null
  const ratio = known ?? expectedRunRatio(label, isSpreadPageId(pageId))

  return (
    <LoadSwap
      loading={!ready}
      placeholder={
        <PageDetailPlaceholder label={label} pageId={pageId} pageNumber={pageNumber} ratio={ratio} summary={summary} pageSrc={pageSrc} panel={panel} info={info} />
      }
    >
      {children}
    </LoadSwap>
  )
}
