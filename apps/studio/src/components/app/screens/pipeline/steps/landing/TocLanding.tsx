import { useState, useEffect, useMemo , type ReactNode } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import { StepLandingShell } from "./StepLandingShell"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import {
  SettingsCard,
  SettingsField,
} from "./ui/SettingsCard"
import { SettingExplainer } from "./ui/SettingExplainer"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { prefersReducedMotion } from "@/lib/utils"
import { TocPreview, type TocModeKey } from "@/components/pipeline/stages/toc/components/TocPreview"
import { TocModeVisual } from "@/components/pipeline/stages/toc/components/TocModeVisual"

export function TocLanding({ bookLabel, beforeRun }: { bookLabel: string; beforeRun?: ReactNode }) {
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
    queueRun({ fromStage: "toc", toStage: "toc", apiKey })
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
    <StepLandingShell
      beforeRun={beforeRun}
      bookLabel={bookLabel}
      stageSlug="toc"
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
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          <Trans>Table of Contents</Trans>
        </h1>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
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
    </StepLandingShell>
  )
}
