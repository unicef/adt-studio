import { useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { RailEntry } from "./ui"

export interface PageRailOptions<P> {
  aspect: PageAspect
  count: (page: P) => number
  subtitle?: (page: P) => string | undefined
  failed?: (page: P) => boolean
  total?: number
  allLabel?: string
}

export function usePageRailEntries<P extends PipelinePage>(
  label: string,
  pages: readonly P[],
  { aspect, count, subtitle, failed, total, allLabel }: PageRailOptions<P>,
): RailEntry[] {
  const { t } = useLingui()
  return useMemo(() => {
    const rows: RailEntry[] = pages.map((page) => ({
      key: page.pageId,
      title: t`Page ${page.pageNumber}`,
      count: count(page),
      subtitle: subtitle?.(page)?.replace(/\n/g, " ") || undefined,
      failed: failed?.(page) ?? false,
      thumb: (
        <PageThumb label={label} pageId={page.pageId} sectionIndex={null} className={aspect.railThumbClassOf(page)} />
      ),
    }))
    const sum = total ?? rows.reduce((acc, row) => acc + row.count, 0)
    return [{ key: "", title: allLabel ?? t`All pages`, count: sum }, ...rows]
  }, [pages, label, aspect, count, subtitle, failed, total, allLabel, t])
}
