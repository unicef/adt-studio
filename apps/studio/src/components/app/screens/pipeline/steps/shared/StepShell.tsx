import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { PluginEmptyState, type Prerequisite, type ScopeKey } from "@/components/app/screens/pipeline/plugins/PluginEmptyState"
import { PreRunChecklist } from "@/components/app/screens/pipeline/plugins/PreRunChecklist"
import { PluginRailEmpty } from "@/components/app/screens/pipeline/plugins/PluginRailEmpty"
import { StepLanding, hasStepLanding } from "./StepLanding"
import { StepRail } from "./ui"
import { LoadingState, type StageSlug } from "@/components/pipeline/components/LoadingState"
import { PluginWorkspace } from "@/components/app/screens/pipeline/plugins/PluginWorkspace"
import { StageRunningPanel } from "@/components/app/screens/pipeline/runs/StageRunningPanel"
import { useOptionalStageActivity, useRunActivity, type RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useStageRun } from "@/components/app/screens/pipeline/runs/useStageRun"
import { isStepSettingsSlug } from "@/components/app/screens/pipeline/settings/slugs"
import { STEP_PREREQ_REASON } from "@/components/app/screens/pipeline/shared/stepPrereq"
import { useStepPrereq } from "@/components/app/screens/pipeline/runs/useStepPrereq"
import { useBookRun } from "@/hooks/use-book-run"
import { ARTIFACT_DERIVED_SLUGS } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import type { StepProps } from "./types"

export interface StepShellProps extends StepProps {
  chips: string[]
  canApply: boolean
  rail: React.ReactNode
  bodyViewportClassName?: string
  children: React.ReactNode
}

export function StepShell({
  label,
  plugin,
  pages,
  frame,
  chips,
  canApply,
  rail,
  bodyViewportClassName,
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
      bodyViewportClassName={bodyViewportClassName}
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
  onRun?: () => void
  onManual?: () => void
  onImport?: () => void
  prerequisites?: Prerequisite[]
  canRun?: boolean
  runDisabledReason?: React.ReactNode
}

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

  const stageRun = useStageRun(label, plugin.slug)
  const activity = useOptionalStageActivity(plugin.slug)
  const run = useRunActivity()
  const prereq = useStepPrereq(label, plugin.slug)

  const name = getStageLabelI18n(plugin.slug)
  const prereqReason = STEP_PREREQ_REASON[plugin.slug]
  const effectiveRun = onRun ?? stageRun.run
  const explicitCanRun = canRun ?? (onRun ? true : stageRun.canRun)
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

function loaderStage(slug: DockSlug): StageSlug | undefined {
  return slug === "sign-language" ? undefined : slug
}

export function StepLoading(props: StepProps) {
  const { t } = useLingui()
  const { plugin } = props
  return (
    <StepShell
      {...props}
      chips={[t`Loading…`]}
      canApply={false}
      rail={<StepRail heading={getStageLabelI18n(plugin.slug)} hex={plugin.hex} entries={[]} />}
    >
      <LoadingState stageSlug={loaderStage(plugin.slug)} label={t`Loading…`} />
    </StepShell>
  )
}

export interface StepOutputQuery {
  isLoading: boolean
  hasOutput: boolean
}

/**
 * Whether the loader should stand in for a step's body, mirroring how the classic
 * UI gates it: the run status decides, so a stage that has produced nothing drops
 * straight to its empty state instead of flashing a loader it will never fill.
 * While the status itself is unknown the loader wins — `LoadingState` holds its
 * visual back 200ms, so a cached read resolves before anything is drawn.
 *
 * The inverse disagreement — the stage reads done but the cached output is still
 * empty — means the completion-time invalidation never reached this client (an
 * SSE reconnect gap, a route handoff mid-run). The classic UI survives that
 * because its landing/content switch follows the run status alone; here the
 * content decides, so the hook heals the cache itself: keep the loader up, force
 * one refetch, and only fall back to the empty state once that refetch confirms
 * the output is genuinely empty.
 */
export function useStepLoading(
  { label, plugin, frame }: StepProps,
  { isLoading, hasOutput }: StepOutputQuery,
): boolean {
  const { isStatusLoading } = useBookRun()
  const queryClient = useQueryClient()
  const [heal, setHeal] = useState<"idle" | "healing" | "done">("idle")

  // These two have no run status to consult — the query being awaited is itself
  // what decides whether they have output, so status and cache cannot disagree.
  const artifactDerived = ARTIFACT_DERIVED_SLUGS.has(plugin.slug)
  const dock = [...frame.foundations, ...frame.plugins].find((item) => item.slug === plugin.slug)
  const stageDone = dock?.state === "done"

  useEffect(() => {
    if (artifactDerived) return
    if (!stageDone) {
      // A re-run took the stage out of done — arm the heal again for its landing.
      if (heal !== "idle") setHeal("idle")
      return
    }
    if (hasOutput || heal !== "idle") return
    setHeal("healing")
    void queryClient
      .invalidateQueries({ queryKey: ["books", label] })
      .finally(() => setHeal("done"))
  }, [artifactDerived, stageDone, hasOutput, heal, queryClient, label])

  if (isStatusLoading) return true
  if (artifactDerived) return isLoading
  if (!stageDone) return false
  return isLoading || (!hasOutput && heal !== "done")
}
