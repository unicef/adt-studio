import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Settings } from "lucide-react"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { AiEditPanel } from "./AiEditPanel"
import { WorkspaceRunButton } from "./WorkspaceRunButton"
import { DockHandle } from "@/components/app/screens/pipeline/chrome/DockHandle"
import { PluginDockPills as PluginDock } from "./PluginDockPills"
import { useOptionalStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { SideRail } from "@/components/app/screens/pipeline/rail/SideRail"
import { type DockEntry } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem, PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { useDockMinimized } from "../shared/workspacePrefs"
import { ScrollArea } from "@/components/ui/scroll-area"

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
  const [dockMinimized, setDockMinimized] = useDockMinimized()
  const name = getStageLabelI18n(plugin.slug)
  const chatPage = pages[0] ?? null

  const activity = useOptionalStageActivity(plugin.slug)
  const isActive = activity?.isActive ?? false
  const runChips = !isActive || !activity
    ? []
    : activity.state === "queued"
      ? [t`Queued`]
      : [
          activity.runningLabel,
          ...(activity.current
            ? [
                activity.current.progress
                  ? `${activity.current.label} · ${activity.current.progress}`
                  : activity.current.label,
              ]
            : []),
        ]

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header
        className="drag-region relative flex h-12.5 shrink-0 items-center gap-3 px-3.5 text-white"
        style={{ background: plugin.hex }}
      >
        <div className="flex flex-1 items-center justify-start gap-1">
            <button
            type="button"
            onClick={onBack}
            style={NO_DRAG_REGION}
            className="flex h-7 items-center gap-1.5 rounded-lg bg-white/16 px-2.5 text-xs font-semibold transition-colors hover:bg-white/24"
            >
            <ArrowLeft className="size-3.5" />
            <Trans>Storyboard</Trans>
            </button>

            <span className="grid size-6.5 place-items-center rounded-full bg-white/20">
            <plugin.icon className="size-3.5" strokeWidth={2.4} />
            </span>

            <span className="text-sm font-semibold">{name}</span>
        </div>

        <div className="flex flex-1 items-center justify-center gap-1.5 drag-region">
          {[...runChips, ...chips].map((chip, index) => (
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
        </div>


        <div className="flex flex-1 justify-end">
            <div className="flex items-center gap-2">
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
            </div>
            <TitleBarControls darkMode className="-my-px -mr-3.5 h-12.5" />
        </div>

              {isActive && activity && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-black/15"
          >
            {activity.isDeterminate ? (
              <span
                className="block h-full bg-white/90 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${activity.fraction * 100}%` }}
              />
            ) : (
              <span className="absolute inset-y-0 left-0 w-2/5 bg-white/90 motion-safe:animate-indeterminate" />
            )}
          </span>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 ">
        <SideRail widthClass="w-56">
          <aside
            className="flex h-full w-56 shrink-0 flex-col gap-2.5 border-r p-3"
          >
            {rail}
          </aside>
        </SideRail>

        <ScrollArea
          horizontal
          className={cn(
            "min-w-0 flex-1 transition-opacity duration-300 ease-out motion-reduce:transition-none",
            isActive && "opacity-60",
          )}
          viewportClassName={cn("flex px-6 [&>div]:mx-auto", bodyViewportClassName)}
        >
          {children}
        </ScrollArea>

        <AiEditPanel
          label={label}
          pageId={chatPage?.pageId ?? null}
          pageLabel={chatPage ? t`page ${chatPage.pageNumber}` : undefined}
          sectionIndex={chatPage?.sections[0]?.sectionIndex ?? 0}
          empty={!hasSections}
        />
      </div>

      <PluginDock
        foundations={foundations}
        plugins={plugins}
        activeSlug={plugin.slug}
        onOpenPlugin={onOpenPlugin}
        minimized={dockMinimized}
        onMinimize={() => setDockMinimized(true)}
      />
      <DockHandle visible={dockMinimized} onShow={() => setDockMinimized(false)} />
    </div>
  )
}
