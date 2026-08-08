import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ChevronRight, Settings, Sparkles } from "lucide-react"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { PluginDock } from "./PluginDock"
import { tint, type DockEntry } from "./plugins"
import type { DockItem } from "./usePipelineState"

export interface PluginWorkspaceProps {
  plugin: DockEntry
  /** Short chips summarising the plugin's current output. */
  chips: string[]
  /** Whether "Apply to book" is actionable — false while there is no output. */
  canApply: boolean
  /** Left rail body: per-page index of the plugin's output. */
  rail: React.ReactNode
  children: React.ReactNode
  foundations: DockItem[]
  plugins: DockItem[]
  onBack: () => void
  onOpenPlugin: (slug: string) => void
  onOpenSettings: () => void
}

/** Full-screen frame for a plugin's long editing session (design 4a). */
export function PluginWorkspace({
  plugin,
  chips,
  canApply,
  rail,
  children,
  foundations,
  plugins,
  onBack,
  onOpenPlugin,
  onOpenSettings,
}: PluginWorkspaceProps) {
  const { t } = useLingui()
  const name = getStageLabelI18n(plugin.slug)

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
          <button
            type="button"
            disabled={!canApply}
            className={cn(
              "h-7 rounded-lg border border-white/25 px-2.5 text-xs font-medium transition-colors",
              canApply ? "hover:bg-white/16" : "opacity-50",
            )}
          >
            <Trans>Apply to book</Trans>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t`${name} settings`}
            title={t`${name} settings`}
            className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-white/16"
          >
            <Settings className="size-3.5" />
          </button>
        </div>

        <TitleBarControls className="-my-px -mr-3.5 h-12.5" />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-56 shrink-0 flex-col gap-2.5 border-r bg-card p-3"
          style={{ backgroundColor: tint(plugin.hex, 0.03) }}
        >
          {rail}
        </aside>

        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto px-6">
          {children}
        </div>

        <aside className="flex w-[46px] shrink-0 flex-col items-center gap-3.5 border-l bg-card py-3">
          <span className="grid size-[30px] place-items-center rounded-[9px] bg-brand-50 text-brand-600">
            <Sparkles className="size-3.5" />
          </span>
          <span className="text-[11px] tracking-[0.06em] text-muted-foreground [writing-mode:vertical-rl]">
            <Trans>Edit with AI</Trans>
          </span>
          <ChevronRight className="mt-auto size-3.5 text-muted-foreground" />
        </aside>
      </div>

      <PluginDock
        foundations={foundations}
        plugins={plugins}
        activeSlug={plugin.slug}
        onOpenPlugin={onOpenPlugin}
      />
      {/*<div className="flex h-[76px] shrink-0 items-center justify-center border-t bg-card">

      </div>*/}
    </div>
  )
}
