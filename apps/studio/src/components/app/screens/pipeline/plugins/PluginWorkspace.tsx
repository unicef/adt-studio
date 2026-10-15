import { useEffect } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronRight, Settings } from "lucide-react"
import { getStageLabelI18n, getStageRunningLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { AiEditPanel } from "./AiEditPanel"
import { WorkspaceRunButton } from "./WorkspaceRunButton"
import { useStepVariant } from "@/components/app/screens/pipeline/shared/useStepVariant"
import { useOptionalStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { SideRail } from "@/components/app/screens/pipeline/rail/SideRail"
import { FOUNDATION_SLUGS, type DockEntry } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem, PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "@/components/ui/sonner"
import { useVariant } from "@/components/app/lab/variants"
import { useBooks } from "@/hooks/use-books"
import { useChromeRoot } from "@/components/app/lab/chrome"
import { StepMap } from "@/components/app/screens/pipeline/chrome/StepMap"
import { TopBar } from "@/components/app/screens/pipeline/chrome/PipelineChrome"
import { useRunFinished } from "@/components/app/screens/pipeline/runs/useRunFinished"
import { RunFinishedBanner } from "@/components/app/screens/pipeline/runs/RunFinishedBanner"
import { LiveRunStrip } from "@/components/app/screens/pipeline/runs/LiveRunPanel"

export interface PluginWorkspaceProps {
  label: string
  plugin: DockEntry
  chips: string[]
  /**
   * Interactive content sitting with the chips — the version picker. It is a
   * control rather than a chip, so it opts out of the window drag region.
   */
  headerExtra?: React.ReactNode
  canApply: boolean
  rail: React.ReactNode
  railEmpty?: boolean
  children: React.ReactNode
  pages: PipelinePage[]
  hasSections: boolean
  foundations: DockItem[]
  plugins: DockItem[]
  onBack: () => void
  onOpenPlugin: (slug: string) => void
  onOpenSettings?: () => void
  bodyViewportClassName?: string
}

export function PluginWorkspace({
  label,
  plugin,
  chips,
  headerExtra,
  rail,
  railEmpty,
  children,
  pages,
  hasSections,
  foundations,
  plugins,
  onBack,
  onOpenPlugin,
  onOpenSettings,
  bodyViewportClassName,
}: PluginWorkspaceProps) {
  const { t } = useLingui()
  const name = getStageLabelI18n(plugin.slug)
  const chatPage = pages[0] ?? null

  const runningVariant = useStepVariant("running", plugin.slug)
  const tbNav = useVariant("topnav")
  const topstep = useVariant("topstep")
  const tbStatus = useVariant("topstatus")
  const { data: books } = useBooks()
  const bookTitle = books?.find((book) => book.label === label)?.title || label
  const chrome = useChromeRoot(plugin.hex)
  const activityStage = runningVariant !== "current" && plugin.slug === "validation" ? "package" : plugin.slug
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
  const isActive = activity?.isActive ?? false
  const returnVariant = useVariant("return")
  const isFoundation = (FOUNDATION_SLUGS as readonly string[]).includes(plugin.slug)
  const [finished, dismissFinished] = useRunFinished(activity)
  const showBanner = finished && returnVariant === "banner"

  useEffect(() => {
    if (!finished || returnVariant !== "toast") return
    toast.success(t`${name} finished`, {
      duration: 10000,
      action: { label: t`View on storyboard`, onClick: onBack },
    })
    dismissFinished()
  }, [finished, returnVariant, name, onBack, dismissFinished, t])
  const statusChips =
    tbStatus === "current" ? chips : tbStatus === "summary" && chips.length > 0 ? [chips.join(" · ")] : []

  const topChrome = (
    <TopBar
      tone={{ hex: plugin.hex, stage: true }}
      left={
        <>
          {tbNav === "book-step" && (
            <>
              <span title={bookTitle} className="min-w-0 max-w-[220px] truncate text-[13px] opacity-75">
                {bookTitle}
              </span>
              <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-50" />
            </>
          )}
          {tbNav === "crumbs" && (
            <>
              <ChevronRight aria-hidden className="-ml-2 size-3.5 shrink-0 opacity-50" />
              <span title={bookTitle} className="min-w-0 max-w-[260px] truncate text-[13px] opacity-80">
                {bookTitle}
              </span>
              <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-50" />
            </>
          )}
          <span data-stage-label="" className="flex shrink-0 items-center gap-2 transition-[background-color,color,box-shadow,padding] duration-300">
            <span data-stage-icon="" className="grid size-6.5 shrink-0 place-items-center rounded-full bg-white/20">
              <plugin.icon className="size-3.5" strokeWidth={2.4} />
            </span>
            <span className="whitespace-nowrap text-sm font-semibold">{name}</span>
          </span>
          {topstep === "map" && <StepMap items={[...foundations, ...plugins]} activeSlug={plugin.slug} />}
        </>
      }
      center={
        <>
          {showBanner && <RunFinishedBanner name={name} onReturn={onBack} onDismiss={dismissFinished} />}
          {!showBanner &&
            statusChips.map((chip, index) => (
              <span
                key={`${index}-${chip}`}
                className="max-w-[220px] truncate rounded-full bg-white/18 px-2.5 py-0.5 text-[11px] tabular-nums"
                title={chip}
              >
                {chip}
              </span>
            ))}
          {headerExtra && (
            <div className="flex items-center" style={NO_DRAG_REGION}>
              {headerExtra}
            </div>
          )}
        </>
      }
      right={
        <>
          <WorkspaceRunButton label={label} slug={plugin.slug} />
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={t`${name} settings`}
              title={t`${name} settings`}
              className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-white/16"
            >
              <Settings className="size-3.5" />
            </button>
          )}
        </>
      }
    />
  )

  return (
    <div {...chrome} className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {topChrome}


      <div data-chrome="row" className="relative flex min-h-0 flex-1 ">
        <SideRail widthClass="w-64" empty={railEmpty}>
          <aside
            className="flex h-full w-64 shrink-0 flex-col gap-2.5 border-r p-3"
          >
            {rail}
          </aside>
        </SideRail>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div data-chrome="center" className="flex min-h-0 flex-1 flex-col" style={{ viewTransitionName: "step-center" }}>
          <ScrollArea
            horizontal
            className={cn(
              "min-h-0 min-w-0 flex-1 transition-opacity duration-300 ease-out motion-reduce:transition-none",
              isActive && runningVariant === "current" && "opacity-60",
            )}
            viewportClassName={cn("flex px-6 [&>div]:mx-auto", bodyViewportClassName)}
          >
            {activityStage !== plugin.slug && isActive && activity && (
              <div className="mx-auto w-full max-w-[860px] pt-6">
                <LiveRunStrip stage={activity} />
              </div>
            )}
            {children}
          </ScrollArea>
          </div>
        </div>

        {!isFoundation && (
          <AiEditPanel
            label={label}
            pageId={chatPage?.pageId ?? null}
            pageLabel={chatPage ? t`page ${chatPage.pageNumber}` : undefined}
            sectionIndex={chatPage?.sections[0]?.sectionIndex ?? 0}
            empty={!hasSections}
          />
        )}
      </div>

    </div>
  )
}
