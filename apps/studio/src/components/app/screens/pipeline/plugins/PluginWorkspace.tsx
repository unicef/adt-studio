import { useEffect, useRef } from "react"
import { useLingui } from "@lingui/react/macro"
import { getStageLabelI18n, getStageRunningLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { useOptionalStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { SideRail } from "@/components/app/screens/pipeline/rail/SideRail"
import type { DockEntry } from "@/components/app/screens/pipeline/shared/plugins"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "@/components/ui/sonner"
import { useVariant } from "@/components/app/lab/variants"
import { useChromeRoot } from "@/components/app/lab/chrome"
import { usePanelFit, useRailOpen } from "@/components/app/screens/pipeline/shared/panelFit"
import { TopBar } from "@/components/app/screens/pipeline/chrome/PipelineChrome"
import { useRunFinished } from "@/components/app/screens/pipeline/runs/useRunFinished"
import { usePageParam } from "@/components/app/screens/pipeline/steps/shared/usePageParam"
import { usePipelineState } from "@/components/app/screens/pipeline/shared/usePipelineState"

export interface PluginWorkspaceProps {
  label: string
  plugin: DockEntry
  headerExtra?: React.ReactNode
  rail: React.ReactNode
  railEmpty?: boolean
  children: React.ReactNode
  onBack: () => void
  onOpenSettings?: () => void
  bodyViewportClassName?: string
}

export function PluginWorkspace({
  label,
  plugin,
  headerExtra,
  rail,
  railEmpty,
  children,
  onBack,
  onOpenSettings,
  bodyViewportClassName,
}: PluginWorkspaceProps) {
  const { t } = useLingui()
  const name = getStageLabelI18n(plugin.slug)

  const chrome = useChromeRoot(plugin.hex)
  const activityStage = plugin.slug === "validation" ? "package" : plugin.slug
  const rawActivity = useOptionalStageActivity(activityStage)
  const activity =
    rawActivity && activityStage !== plugin.slug
      ? {
          ...rawActivity,
          label: getStageLabelI18n(plugin.slug),
          runningLabel: getStageRunningLabelI18n(plugin.slug),
          hex: plugin.hex,
          icon: plugin.icon,
        }
      : rawActivity
  const returnVariant = useVariant("return")
  const rowRef = useRef<HTMLDivElement>(null)
  const [railOpen] = useRailOpen()
  const railToggleShown = !railOpen && !railEmpty
  usePanelFit(rowRef)
  const [finished, dismissFinished] = useRunFinished(activity)

  useEffect(() => {
    if (!finished || returnVariant !== "toast") return
    toast.success(t`${name} finished`, {
      duration: 10000,
      action: { label: t`View on storyboard`, onClick: onBack },
    })
    dismissFinished()
  }, [finished, returnVariant, name, onBack, dismissFinished, t])
  const { pageParam, closeDetail } = usePageParam(label, plugin.slug)
  const { pages } = usePipelineState(label)
  const detailPage = pageParam ? pages.find((page) => page.pageId === pageParam) : undefined

  const topChrome = (
    <TopBar
      tone={{ hex: plugin.hex, stage: true }}
      location={{
        icon: plugin.icon,
        hex: plugin.hex,
        area: name,
        onArea: closeDetail,
        item: detailPage ? t`Page ${detailPage.pageNumber}` : undefined,
        version: headerExtra,
      }}
      settings={onOpenSettings ? { label: t`${name} settings`, onOpen: onOpenSettings } : undefined}
    />
  )

  return (
    <div {...chrome} className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {topChrome}

      <div ref={rowRef} data-chrome="row" className="relative flex min-h-0 flex-1 ">
        <SideRail widthClass="w-64" empty={railEmpty}>
          <aside
            aria-label={t`${name} list`}
            className="flex h-full w-64 shrink-0 flex-col gap-2.5 border-r p-3"
          >
            {rail}
          </aside>
        </SideRail>

        <main id="pipeline-canvas" tabIndex={-1} aria-label={name} className="flex min-h-0 min-w-0 flex-1 flex-col outline-none">
          <div data-chrome="center" className="flex min-h-0 flex-1 flex-col" style={{ viewTransitionName: "step-center" }}>
          <ScrollArea
            horizontal
            className="min-h-0 min-w-0 flex-1"
            viewportClassName={cn(
              "flex px-6 transition-[padding] duration-300 ease-out motion-reduce:transition-none [&>div]:mx-auto",
              railToggleShown && "pl-16",
              bodyViewportClassName,
            )}
          >
            {children}
          </ScrollArea>
          </div>
        </main>
      </div>

    </div>
  )
}
