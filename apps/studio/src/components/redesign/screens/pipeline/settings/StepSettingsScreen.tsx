import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Settings, X } from "lucide-react"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { NO_DRAG_REGION } from "@/constants"
import { useBookRun } from "@/hooks/use-book-run"
import { SettingsDirtyTabsProvider } from "@/hooks/use-settings-dirty-tabs"
import { SettingsRemountProvider } from "@/hooks/use-settings-remount"
import { SettingsReturnProvider } from "@/hooks/use-settings-return"
import { DockHandle } from "@/components/redesign/screens/pipeline/chrome/DockHandle"
import { PluginDockPills as PluginDock } from "@/components/redesign/screens/pipeline/plugins/PluginDockPills"
import { tint } from "@/components/redesign/screens/pipeline/shared/plugins"
import { useDockMinimized } from "@/components/redesign/screens/pipeline/shared/workspacePrefs"
import type { DockItem } from "@/components/redesign/screens/pipeline/shared/usePipelineState"
import { hasStepLanding } from "@/components/redesign/screens/pipeline/steps/shared/StepLanding"
import { SettingsTabsRail } from "./SettingsTabsRail"
import { StepSettingsBody } from "./StepSettingsBody"
import { stepSettingsTabs, type StepSettingsSlug } from "./slugs"

export interface StepSettingsScreenProps {
  label: string
  slug: StepSettingsSlug
  tab: string
  foundations: DockItem[]
  plugins: DockItem[]
  onClose: () => void
  onSelectTab: (tab: string) => void
  onOpenPlugin: (slug: string) => void
}

export function StepSettingsScreen(props: StepSettingsScreenProps) {
  return (
    <FloatingSaveProvider barClassName="bottom-27">
      <SettingsDirtyTabsProvider>
        <SettingsReturnProvider value={props.onClose}>
          <UnsavedChangesGuard />
          <StepSettingsFrame {...props} />
        </SettingsReturnProvider>
      </SettingsDirtyTabsProvider>
    </FloatingSaveProvider>
  )
}

function StepSettingsFrame({
  label,
  slug,
  tab,
  foundations,
  plugins,
  onClose,
  onSelectTab,
  onOpenPlugin,
}: StepSettingsScreenProps) {
  const { t, i18n } = useLingui()
  const [discardNonce, setDiscardNonce] = useState(0)
  const [dockMinimized, setDockMinimized] = useDockMinimized()
  const { stageState } = useBookRun()
  const runState = stageState(slug)
  const landingReachable =
    runState === "done" || runState === "running" || runState === "queued"

  const stage = STAGES.find((s) => s.slug === slug)
  const hex = stage?.hex ?? "#4b5563"
  const StageIcon = stage?.icon ?? Settings
  const name = getStageLabelI18n(slug)
  // Overview is the stage's landing page. It only earns a tab once the stage has
  // output to re-run against — before that the step view itself is the landing.
  const showOverview = hasStepLanding(slug) && landingReachable
  const tabs = stepSettingsTabs(slug, i18n, showOverview)
  const activeTab = tabs.some((entry) => entry.key === tab) ? tab : (tabs[0]?.key ?? "general")

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header
        className="drag-region flex h-12.5 shrink-0 items-center gap-3 px-3.5 text-white"
        style={{ background: hex }}
      >
        <button
          type="button"
          onClick={onClose}
          style={NO_DRAG_REGION}
          className="flex h-7 items-center gap-1.5 rounded-lg bg-white/16 px-2.5 text-xs font-semibold transition-colors hover:bg-white/24"
        >
          <ArrowLeft className="size-3.5" />
          {name}
        </button>

        <span className="grid size-6.5 place-items-center rounded-full bg-white/20">
          <StageIcon className="size-3.5" strokeWidth={2.4} />
        </span>
        <span className="text-sm font-semibold">
          <Trans>Settings</Trans>
        </span>

        <div className="flex-1" />

        <div style={NO_DRAG_REGION} className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Close ${name} settings`}
            title={t`Close ${name} settings`}
            className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-white/16"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <TitleBarControls darkMode className="-my-px -mr-3.5 h-12.5" />
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside
          className="flex w-56 shrink-0 flex-col gap-2.5 border-r bg-card p-3"
          style={{ backgroundColor: tint(hex, 0.03) }}
        >
          <SettingsTabsRail
            slug={slug}
            hex={hex}
            tabs={tabs}
            activeTab={activeTab}
            onSelect={onSelectTab}
          />
        </aside>

        <SettingsRemountProvider value={() => setDiscardNonce((n) => n + 1)}>
          <div key={discardNonce} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto pb-27">
            <StepSettingsBody label={label} slug={slug} tab={activeTab} />
          </div>
        </SettingsRemountProvider>
      </div>

      <PluginDock
        foundations={foundations}
        plugins={plugins}
        activeSlug={slug}
        onOpenPlugin={onOpenPlugin}
        minimized={dockMinimized}
        onMinimize={() => setDockMinimized(true)}
      />
      <DockHandle visible={dockMinimized} onShow={() => setDockMinimized(false)} />
    </div>
  )
}
