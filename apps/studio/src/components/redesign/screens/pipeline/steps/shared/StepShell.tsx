import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { PluginEmptyState, type Prerequisite, type ScopeKey } from "@/components/redesign/screens/pipeline/plugins/PluginEmptyState"
import { PreRunChecklist } from "@/components/redesign/screens/pipeline/plugins/PreRunChecklist"
import { PluginRailEmpty } from "@/components/redesign/screens/pipeline/plugins/PluginRailEmpty"
import { StepLanding, hasStepLanding } from "./StepLanding"
import { PluginWorkspace } from "@/components/redesign/screens/pipeline/plugins/PluginWorkspace"
import { StageRunningPanel } from "@/components/redesign/screens/pipeline/runs/StageRunningPanel"
import { useOptionalStageActivity, useRunActivity, type RunStageActivity } from "@/components/redesign/screens/pipeline/runs/useRunActivity"
import { useStageRun } from "@/components/redesign/screens/pipeline/runs/useStageRun"
import { isStepSettingsSlug } from "@/components/redesign/screens/pipeline/settings/slugs"
import { STEP_PREREQ_REASON } from "@/components/redesign/screens/pipeline/shared/stepPrereq"
import { useStepPrereq } from "@/components/redesign/screens/pipeline/runs/useStepPrereq"
import type { StepProps } from "./types"

export interface StepShellProps extends StepProps {
  chips: string[]
  canApply: boolean
  rail: React.ReactNode
  children: React.ReactNode
}

/** The workspace frame with a step's own rail and body plugged in. */
export function StepShell({
  label,
  plugin,
  pages,
  frame,
  chips,
  canApply,
  rail,
  children,
}: StepShellProps) {
  return (
    <PluginWorkspace
      label={label}
      plugin={plugin}
      chips={chips}
      canApply={canApply}
      rail={rail}
      pages={pages}
      hasSections={frame.hasSections}
      foundations={frame.foundations}
      plugins={frame.plugins}
      onBack={frame.onBack}
      onOpenPlugin={frame.onOpenPlugin}
      onOpenSettings={
        isStepSettingsSlug(plugin.slug) ? () => frame.onOpenSettings(plugin.slug) : undefined
      }
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
  const { t, i18n } = useLingui()
  const { label, plugin, pages, frame } = props
  const [scope, setScope] = useState<ScopeKey>("book")

  // Every step's primary action queues its own stage unless the step overrides
  // it — sign language uploads a file, sectioning resolves its own start stage.
  const stageRun = useStageRun(label, plugin.slug)
  const activity = useOptionalStageActivity(plugin.slug)
  const run = useRunActivity()
  const prereq = useStepPrereq(label, plugin.slug)

  const name = getStageLabelI18n(plugin.slug)
  const prereqReason = STEP_PREREQ_REASON[plugin.slug]
  const effectiveRun = onRun ?? stageRun.run
  const explicitCanRun = canRun ?? (onRun ? true : stageRun.canRun)
  // The blocking upstream wins over everything: no API key matters if the step
  // has nothing to run against yet.
  const effectiveCanRun = prereq.isMet && explicitCanRun
  const effectiveReason = !prereq.isMet ? (
    prereqReason ? (
      i18n._(prereqReason)
    ) : (
      <Trans>Run {prereq.upstreamLabel} first.</Trans>
    )
  ) : (
    runDisabledReason ??
    (!stageRun.isRunnable ? null : !stageRun.hasApiKey ? (
      <Trans>Add an API key in Book settings to run {name}.</Trans>
    ) : null)
  )

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

  const checklist =
    prerequisites ?? [
      ...(prereq.upstream
        ? [
            {
              key: "upstream",
              met: prereq.isMet,
              label: prereq.upstreamInFlight
                ? t`${prereq.upstreamLabel} in progress — this stage waits its turn`
                : t`${prereq.upstreamLabel} finished`,
            },
          ]
        : []),
      {
        key: "sections",
        met: frame.hasSections,
        label: t`Sections generated — ${frame.sectionCount} sections across ${pages.length} pages`,
      },
      ...(stageRun.isRunnable
        ? [
            {
              key: "api-key",
              met: stageRun.hasApiKey,
              label: t`API key set in Book settings`,
            },
          ]
        : []),
    ]

  const rail = (
    <PluginRailEmpty
      hex={plugin.hex}
      title={getStageLabelI18n(plugin.slug)}
      pageCount={pages.length}
      sectionCount={frame.sectionCount}
    />
  )

  // The stage's own landing owns its run gating and the settings that drive its
  // preview, so it replaces the generic empty state wherever one exists.
  if (hasStepLanding(plugin.slug)) {
    return (
      <StepShell
        {...props}
        chips={[t`Never run`, t`${pages.length} pages ready`]}
        canApply={false}
        rail={rail}
      >
        <StepLanding
          label={label}
          slug={plugin.slug}
          beforeRun={<PreRunChecklist items={checklist} />}
        />
      </StepShell>
    )
  }

  return (
    <StepShell
      {...props}
      chips={[t`Never run`, t`${pages.length} pages ready`]}
      canApply={false}
      rail={rail}
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
        prerequisites={checklist}
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
      chips={[]}
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
