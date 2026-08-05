import { useState, useEffect, useMemo } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import {
  SettingsCard,
  SettingsField,
} from "@/components/pipeline/components/SettingsCard"
import { SettingExplainer } from "@/components/pipeline/components/SettingExplainer"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { prefersReducedMotion } from "@/lib/utils"
import { TocPreview, type TocModeKey } from "./components/TocPreview"
import { TocModeVisual } from "./components/TocModeVisual"

export function TocLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("toc")
  const storyboardStatus = useStageStatus("storyboard")
  const storyboardReady = storyboardStatus.isCompleted

  const [tocMode, setTocMode] = useState<TocModeKey>("extract")

  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    if (m.toc_mode === "extract" || m.toc_mode === "dynamic") {
      setTocMode(m.toc_mode)
    }
  }, [activeConfigData])

  const handleModeChange = (value: TocModeKey) => {
    const update = () => {
      setTocMode(value)
      persist({ toc_mode: value })
    }
    const reduceMotion = prefersReducedMotion()
    const doc = typeof document !== "undefined" ? document : null
    if (!doc || typeof doc.startViewTransition !== "function" || reduceMotion) {
      update()
      return
    }
    doc.startViewTransition(() => {
      flushSync(update)
    })
  }

  const handleRun = () => {
    if (!hasApiKey || !storyboardReady || status.isRunning) return
    queueRun({ fromStage: "toc", toStage: "toc", apiKey, viewAfter: true })
  }

  const modeOptions = useMemo(
    () => [
      { value: "extract" as const, label: t`Extract` },
      { value: "dynamic" as const, label: t`Dynamic` },
    ],
    [t],
  )

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run TOC generation.</Trans>
  ) : !storyboardReady ? (
    <Trans>Run Storyboard first — the table of contents lists the typed sections it produces.</Trans>
  ) : undefined

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="toc"
      settingsTab="general"
      colorClass="bg-amber-600 hover:bg-amber-700"
      accentColor="#d97706"
      accentColorSoft="#fef3c7"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey || !storyboardReady}
      disabledReason={disabledReason}
      runLabel={<Trans>Run TOC</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`TOC Preview`}
      onRun={handleRun}
      preview={<TocPreview mode={tocMode} />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Table of Contents</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Build a navigable table of contents for the book. Decide whether
            entries mirror the typed section headings exactly or whether the
            model rephrases them into descriptive chapter titles.
          </Trans>
        </p>
      </div>

      <PrereqGuard
        upstreamSlug="storyboard"
        stageSlug="toc"
        description={
          <Trans>
            The TOC lists the typed sections placed by Storyboard. Finish
            Storyboard before running this stage.
          </Trans>
        }
      />

      <SettingsCard>
        <SettingsField
          label={<Trans>TOC Mode</Trans>}
          labelAction={<SettingExplainer visual={<TocModeVisual />} />}
          hint={
            tocMode === "extract" ? (
              <Trans>
                Use section headings verbatim. Fast, deterministic, and
                preserves the original wording from the book.
              </Trans>
            ) : (
              <Trans>
                Let the model write descriptive chapter titles based on each
                section's contents. Best for storybooks or when headings are
                missing.
              </Trans>
            )
          }
        >
          <SegmentedControl
            options={modeOptions}
            value={tocMode}
            onValueChange={handleModeChange}
          />
        </SettingsField>
      </SettingsCard>
    </LandingPageShell>
  )
}
