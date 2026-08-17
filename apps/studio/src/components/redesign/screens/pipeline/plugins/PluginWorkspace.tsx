import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Settings } from "lucide-react"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { AiEditPanel } from "./AiEditPanel"
import { DockHandle } from "@/components/redesign/screens/pipeline/chrome/DockHandle"
import { PluginDockPills as PluginDock } from "./PluginDockPills"
import { SideRail } from "@/components/redesign/screens/pipeline/rail/SideRail"
import { tint, type DockEntry } from "@/components/redesign/screens/pipeline/shared/plugins"
import type { DockItem, PipelinePage } from "@/components/redesign/screens/pipeline/shared/usePipelineState"
import { useDockMinimized } from "../shared/workspacePrefs"

export interface PluginWorkspaceProps {
  label: string
  plugin: DockEntry
  /** Short chips summarising the plugin's current output. */
  chips: string[]
  /** Whether "Apply to book" is actionable — false while there is no output. */
  canApply: boolean
  /** Left rail body: per-page index of the plugin's output. */
  rail: React.ReactNode
  children: React.ReactNode
  pages: PipelinePage[]
  hasSections: boolean
  foundations: DockItem[]
  plugins: DockItem[]
  onBack: () => void
  onOpenPlugin: (slug: string) => void
  /** Omitted for steps that have no settings of their own — the gear is hidden. */
  onOpenSettings?: () => void
}

/** Full-screen frame for a plugin's long editing session (design 4a). */
export function PluginWorkspace({
  label,
  plugin,
  chips,
  canApply,
  rail,
  children,
  pages,
  hasSections,
  foundations,
  plugins,
  onBack,
  onOpenPlugin,
  onOpenSettings,
}: PluginWorkspaceProps) {
  const { t } = useLingui()
  const [dockMinimized, setDockMinimized] = useDockMinimized()
  const name = getStageLabelI18n(plugin.slug)
  // No step reports its own selection upward, so the AI rail falls back to the
  // first page — the same fallback the pipeline screen uses.
  const chatPage = pages[0] ?? null

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header
        className="drag-region flex h-12.5 shrink-0 items-center gap-3 px-3.5 text-white"
        style={{ background: plugin.hex }}
      >
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

        <div className="flex flex-1 items-center justify-center gap-1.5">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full bg-white/18 px-2.5 py-0.5 text-[11px]">
              {chip}
            </span>
          ))}
        </div>

        <div style={NO_DRAG_REGION} className="flex items-center gap-2">
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

        <TitleBarControls className="-my-px -mr-3.5 h-12.5" />
      </header>

      <div className="relative flex min-h-0 flex-1">
        <SideRail widthClass="w-56">
          <aside
            className="flex h-full w-56 shrink-0 flex-col gap-2.5 border-r p-3"
          >
            {rail}
          </aside>
        </SideRail>

        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto px-6">
          {children}
        </div>

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
