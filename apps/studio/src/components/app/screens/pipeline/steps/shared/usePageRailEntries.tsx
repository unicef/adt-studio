import { useMemo, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { RailEntry } from "./ui"
import { largeRailThumbClass } from "./rail/railThumb"

export interface PageRailOptions<P> {
  aspect: PageAspect
  count: (page: P) => number
  subtitle?: (page: P) => string | undefined
  failed?: (page: P) => boolean
  meta?: (page: P) => ReactNode
  total?: number
  allLabel?: string
}

export function usePageRailEntries<P extends PipelinePage>(
  label: string,
  pages: readonly P[],
  { aspect, count, subtitle, failed, meta, total, allLabel }: PageRailOptions<P>,
): RailEntry[] {
  const { t } = useLingui()
  return useMemo(() => {
    const rows: RailEntry[] = pages.map((page) => ({
      key: page.pageId,
      title: t`Page ${page.pageNumber}`,
      count: count(page),
      subtitle: subtitle?.(page)?.replace(/\n/g, " ") || undefined,
      failed: failed?.(page) ?? false,
      pageNumber: page.pageNumber,
      searchText: page.textPreview,
      meta: meta?.(page),
      thumb: <PageThumb label={label} pageId={page.pageId} sectionIndex={null} className={largeRailThumbClass(aspect.ratioOf(page))} />,
    }))
    const sum = total ?? rows.reduce((acc, row) => acc + row.count, 0)
    return [{ key: "", title: allLabel ?? t`All pages`, count: sum }, ...rows]
  }, [pages, label, aspect, count, subtitle, failed, meta, total, allLabel, t])
}
