import { useRouterState } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { LayoutGrid } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { StalePopoverBody } from "@/components/app/screens/pipeline/canvas/stale/StaleNotices"
import { useStaleNotice } from "@/components/app/screens/pipeline/canvas/stale/useStaleNotice"
import { usePageRebuild } from "@/components/app/screens/pipeline/runs/usePageRebuild"
import { useStoryboardRerun } from "@/components/app/screens/pipeline/runs/useStoryboardRerun"
import { useStoryboardStaleness } from "@/components/app/screens/pipeline/runs/useStoryboardStaleness"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { usePipelineState } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { Ring, RingButton, type RingModel } from "./StatusRing"

export function StaleRing({ label }: { label: string }) {
  const { t } = useLingui()
  const { pages } = usePipelineState(label)
  const staleness = useStoryboardStaleness(label, pages)
  const rebuild = usePageRebuild(label)
  const rerun = useStoryboardRerun(label)
  const nav = usePipelineNavigation(label)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const pageId = pathname.match(/\/pages\/([^/]+)/)?.[1] ?? null
  const page = pages.find((candidate) => candidate.pageId === pageId) ?? null
  const notice = useStaleNotice({ pages, page, staleness, rerun, rebuild, onSelectPage: nav.openPage })

  if (!staleness.isStale) return null

  const busy = notice.rebuildingCount > 0
  const count = notice.outdatedIds.length
  const text = busy
    ? t`${plural(notice.rebuildingCount, { one: "Rebuilding # page", other: "Rebuilding # pages" })}`
    : count > 0
      ? t`${plural(count, { one: "# page out of date", other: "# pages out of date" })}`
      : t`The storyboard is out of date`
  const model: RingModel = {
    tone: busy ? "run" : "stale",
    icon: LayoutGrid,
    hex: STORYBOARD_HEX,
    name: text,
    text,
    fraction: null,
    waiting: 0,
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <RingButton label={t`${text} — show details`} className="data-[state=open]:bg-muted">
          <Ring model={model} />
        </RingButton>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="flex w-80 flex-col gap-3 p-3.5">
        <StalePopoverBody notice={notice} />
      </PopoverContent>
    </Popover>
  )
}
