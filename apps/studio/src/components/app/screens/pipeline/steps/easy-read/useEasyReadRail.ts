import { useCallback, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { EasyReadSectionBlock } from "@/api/client"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { RailEntry } from "../shared/ui"
import { usePageRailEntries } from "../shared/usePageRailEntries"
import { entryCount, firstLine, pageSearchText } from "./easyReadPages"

export function useEasyReadRail(
  label: string,
  pages: readonly PipelinePage[],
  {
    aspect,
    total,
    blocksOn,
    isFailed,
  }: {
    aspect: PageAspect
    total: number
    blocksOn: (pageId: string) => readonly EasyReadSectionBlock[]
    isFailed: (pageId: string) => boolean
  },
): RailEntry[] {
  const { t } = useLingui()
  const count = useCallback((page: PipelinePage) => entryCount(blocksOn(page.pageId)), [blocksOn])
  const subtitle = useCallback((page: PipelinePage) => firstLine(blocksOn(page.pageId)), [blocksOn])
  const failed = useCallback((page: PipelinePage) => isFailed(page.pageId), [isFailed])
  const rows = usePageRailEntries(label, pages, { aspect, total, allLabel: t`All pages`, count, subtitle, failed })

  return useMemo(
    () =>
      rows.map((row) => {
        if (!row.key) return row
        const text = [pageSearchText(blocksOn(row.key)), row.searchText ?? ""].join("\n").trim()
        return { ...row, searchText: text || undefined, emptySubtitle: null }
      }),
    [rows, blocksOn],
  )
}
