import { useState } from "react"
import { useChromeRoot } from "@/components/app/lab/chrome"
import { Trans, useLingui } from "@lingui/react/macro"
import { Settings, X } from "lucide-react"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { TopBar } from "@/components/app/screens/pipeline/chrome/PipelineChrome"
import { useBookRun } from "@/hooks/use-book-run"
import { SettingsDirtyTabsProvider } from "@/hooks/use-settings-dirty-tabs"
import { SettingsRemountProvider } from "@/hooks/use-settings-remount"
import { SettingsReturnProvider } from "@/hooks/use-settings-return"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { hasStepLanding } from "@/components/app/screens/pipeline/steps/shared/StepLanding"
import { useSettingsAnchor } from "@/components/app/screens/settings/useSettingsAnchor"
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
  onSelectTab: (tab: string, anchor?: string) => void
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
  onClose,
  onSelectTab,
}: StepSettingsScreenProps) {
  const { t, i18n } = useLingui()
  const [discardNonce, setDiscardNonce] = useState(0)
  const { stageState } = useBookRun()
  useSettingsAnchor()
  const runState = stageState(slug)
  const landingReachable =
    runState === "done" || runState === "running" || runState === "queued"

  const stage = STAGES.find((s) => s.slug === slug)
  const hex = stage?.hex ?? "#4b5563"
  const StageIcon = stage?.icon ?? Settings
  const name = getStageLabelI18n(slug)
  const otherChrome = useChromeRoot(hex)
  const showOverview = hasStepLanding(slug) && landingReachable
  const tabs = stepSettingsTabs(slug, i18n, showOverview)
  const activeTab = tabs.some((entry) => entry.key === tab) ? tab : (tabs[0]?.key ?? "general")

  return (
    <div {...otherChrome} className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        tone={{ hex, stage: true }}
        location={{ icon: StageIcon, hex, area: name, onArea: onClose, item: <Trans>Settings</Trans> }}
        right={
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Close ${name} settings`}
            title={t`Close ${name} settings`}
            className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-white/16"
          >
            <X className="size-3.5" />
          </button>
        }
      />

      <div data-chrome="row" className="relative flex min-h-0 flex-1">
        <aside
          data-chrome="rail"
          className="flex w-64 shrink-0 flex-col gap-2.5 border-r bg-card p-3"
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
          <div key={discardNonce} data-chrome="center" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto pb-27">
            <StepSettingsBody label={label} slug={slug} tab={activeTab} />
          </div>
        </SettingsRemountProvider>
      </div>

    </div>
  )
}
