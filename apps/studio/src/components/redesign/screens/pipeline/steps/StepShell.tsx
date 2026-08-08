import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { PluginEmptyState, type Prerequisite, type ScopeKey } from "../PluginEmptyState"
import { PluginRailEmpty } from "../PluginRailEmpty"
import { PluginWorkspace } from "../PluginWorkspace"
import { StageRunningPanel } from "../StageRunningPanel"
import { useOptionalStageActivity, useRunActivity, type RunStageActivity } from "../useRunActivity"
import { useStageRun } from "../useStageRun"
import type { StepProps } from "./types"

export interface StepShellProps extends StepProps {
  chips: string[]
  canApply: boolean
  rail: React.ReactNode
  children: React.ReactNode
}

/** The workspace frame with a step's own rail and body plugged in. */
export function StepShell({ plugin, frame, chips, canApply, rail, children }: StepShellProps) {
  return (
    <PluginWorkspace
      plugin={plugin}
      chips={chips}
      canApply={canApply}
      rail={rail}
      foundations={frame.foundations}
      plugins={frame.plugins}
      onBack={frame.onBack}
      onOpenPlugin={frame.onOpenPlugin}
      onOpenSettings={() => frame.onOpenSettings(plugin.slug)}
    >
      {children}
    </PluginWorkspace>
  )
}

export interface StepEmptyProps extends StepProps {
  /** Overrides the default "queue this stage" action. */
  onRun?: () => void
  onManual?: () => void
  onImport?: () => void
  /** Overrides the default "sections exist, text is normalized" checklist. */
  prerequisites?: Prerequisite[]
  canRun?: boolean
  runDisabledReason?: React.ReactNode
}

/** The never-run frame every step falls back to (design 4a). */
export function StepEmpty({
  onRun,
  onManual,
  onImport,
  prerequisites,
  canRun,
  runDisabledReason,
  ...props
}: StepEmptyProps) {
  const { t } = useLingui()
  const { label, plugin, pages, frame } = props
  const [scope, setScope] = useState<ScopeKey>("book")

  // Every step's primary action queues its own stage unless the step overrides
  // it — sign language uploads a file, sectioning resolves its own start stage.
  const stageRun = useStageRun(label, plugin.slug)
  const activity = useOptionalStageActivity(plugin.slug)
  const run = useRunActivity()

  const name = getStageLabelI18n(plugin.slug)
  const effectiveRun = onRun ?? stageRun.run
  const effectiveCanRun = canRun ?? (onRun ? true : stageRun.canRun)
  const effectiveReason =
    runDisabledReason ??
    (!stageRun.isRunnable ? null : !stageRun.hasApiKey ? (
      <Trans>Add an API key in Book settings to run {name}.</Trans>
    ) : stageRun.isRunning ? (
      <Trans>A run is already in progress.</Trans>
    ) : null)

  // Once queued, this stage takes over the frame so the click has visible effect.
  if (activity?.isActive) {
    return (
      <StepRunning
        {...props}
        stage={activity}
        isCancelling={run.isCancelling}
        onCancel={run.cancelRun}
      />
    )
  }

  return (
    <StepShell
      {...props}
      chips={[t`Never run`, t`${pages.length} pages ready`]}
      canApply={false}
      rail={
        <PluginRailEmpty
          hex={plugin.hex}
          title={getStageLabelI18n(plugin.slug)}
          pageCount={pages.length}
          sectionCount={frame.sectionCount}
        />
      }
    >
      <PluginEmptyState
        plugin={plugin}
        scope={scope}
        onScopeChange={setScope}
        onRun={effectiveRun}
        onManual={onManual ?? (() => {})}
        onImport={onImport}
        canRun={effectiveCanRun}
        runDisabledReason={effectiveReason}
        prerequisites={
          prerequisites ?? [
            {
              key: "sections",
              met: frame.hasSections,
              label: t`Sections generated — ${frame.sectionCount} sections across ${pages.length} pages`,
            },
            { key: "extract", met: frame.extractDone, label: t`Text normalized by extraction` },
          ]
        }
      />
    </StepShell>
  )
}

export interface StepRunningProps extends StepProps {
  stage: RunStageActivity
  isCancelling?: boolean
  onCancel?: () => void
  outcome?: React.ReactNode
}

/** Frame shown while the step's own stage is queued or running. */
export function StepRunning({
  stage,
  isCancelling,
  onCancel,
  outcome,
  ...props
}: StepRunningProps) {
  const { plugin, pages, frame } = props
  return (
    <StepShell
      {...props}
      chips={[stage.state === "queued" ? stage.label : stage.runningLabel]}
      canApply={false}
      rail={
        <PluginRailEmpty
          hex={plugin.hex}
          title={getStageLabelI18n(plugin.slug)}
          pageCount={pages.length}
          sectionCount={frame.sectionCount}
        />
      }
    >
      <StageRunningPanel
        stage={stage}
        isCancelling={isCancelling}
        onCancel={onCancel}
        outcome={outcome}
      />
    </StepShell>
  )
}

/** Loading frame shown while a step's output is being fetched. */
export function StepLoading(props: StepProps) {
  const { t } = useLingui()
  const { plugin, pages, frame } = props
  return (
    <StepShell
      {...props}
      chips={[t`Loading…`]}
      canApply={false}
      rail={
        <PluginRailEmpty
          hex={plugin.hex}
          title={getStageLabelI18n(plugin.slug)}
          pageCount={pages.length}
          sectionCount={frame.sectionCount}
        />
      }
    >
      <span className="text-sm text-muted-foreground">{t`Loading…`}</span>
    </StepShell>
  )
}
