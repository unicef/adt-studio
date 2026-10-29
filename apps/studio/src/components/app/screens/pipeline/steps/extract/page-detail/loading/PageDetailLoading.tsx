import type { ReactNode } from "react"
import { usePages } from "@/hooks/use-pages"
import { expectedRunRatio, isSpreadPageId } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { LoadSwap } from "./LoadSwap"
import { PageDetailPlaceholder } from "./PageDetailPlaceholder"

export function PageDetailLoading({
  label,
  pageId,
  pageNumber,
  ready,
  pageSrc,
  children,
}: {
  label: string
  pageId: string
  pageNumber: number
  ready: boolean
  pageSrc: string | null
  children: ReactNode
}) {
  const pages = usePages(label, { enabled: false })
  const summary = pages.data?.find((page) => page.pageId === pageId) ?? null
  const known = summary?.pageWidth && summary.pageHeight ? summary.pageWidth / summary.pageHeight : null
  const ratio = known ?? expectedRunRatio(label, isSpreadPageId(pageId))

  return (
    <LoadSwap
      loading={!ready}
      placeholder={<PageDetailPlaceholder label={label} pageId={pageId} pageNumber={pageNumber} ratio={ratio} summary={summary} pageSrc={pageSrc} />}
    >
      {children}
    </LoadSwap>
  )
}
