import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { plural } from "@lingui/core/macro"
import { useStageStatus } from "@/hooks/use-stage-status"
import { Trans, useLingui } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { PluginEmptyState, type Prerequisite, type ScopeKey } from "@/components/app/screens/pipeline/plugins/PluginEmptyState"
import { PreRunChecklist } from "@/components/app/screens/pipeline/plugins/PreRunChecklist"
import { PluginRailEmpty } from "@/components/app/screens/pipeline/plugins/PluginRailEmpty"
import { StepLanding, hasStepLanding } from "./StepLanding"
import { hasFullHeightLanding } from "../landing/fullHeight"
import { StageContentSkeleton, StepRailSkeleton, stepLoadingShape, type StepLoadingShape } from "./StepLoadingSkeleton"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { PluginWorkspace } from "@/components/app/screens/pipeline/plugins/PluginWorkspace"
import { LiveRunPanel, RunChecklist, progressCounts } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import { useOptionalStageActivity, useRunActivity, type RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useStageRun } from "@/components/app/screens/pipeline/runs/useStageRun"
import { isStepSettingsSlug } from "@/components/app/screens/pipeline/settings/slugs"
import { stepPrereqReason } from "@/components/app/screens/pipeline/shared/stepPrereq"
import { useStepPrereq } from "@/components/app/screens/pipeline/runs/useStepPrereq"
import { useBookRun } from "@/hooks/use-book-run"
import { ARTIFACT_DERIVED_SLUGS } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { StepProps } from "./types"

export interface StepShellProps extends StepProps {
  chips: string[]
  /** Version picker for the step header, alongside the chips. */
  headerExtra?: React.ReactNode
  rail: React.ReactNode
  railEmpty?: boolean
  bodyViewportClassName?: string
  children: React.ReactNode
}

export function StepShell({
  label,
  plugin,
  frame,
  headerExtra,
  rail,
  railEmpty,
  bodyViewportClassName,
  children,
}: StepShellProps) {
  return (
    <PluginWorkspace
      label={label}
      plugin={plugin}
      headerExtra={headerExtra}
      rail={rail}
      railEmpty={railEmpty}
      bodyViewportClassName={bodyViewportClassName}
      onBack={frame.onBack}
      onOpenSettings={
        isStepSettingsSlug(plugin.slug) ? () => frame.onOpenSettings(plugin.slug) : undefined
      }
    >
      {children}
    </PluginWorkspace>
  )
}

export interface StepView {
  chips: string[]
  rail: React.ReactNode
  railEmpty?: boolean
  bodyViewportClassName?: string
  children: React.ReactNode
}

export interface StepEmptyProps extends StepProps {
  onRun?: () => void
  onManual?: () => void
  onImport?: () => void
  prerequisites?: Prerequisite[]
  canRun?: boolean
  runDisabledReason?: React.ReactNode
}

export function StepEmpty(props: StepEmptyProps) {
  const view = useStepEmptyView(props)
  const { onRun: _run, onManual: _manual, onImport: _import, prerequisites: _prerequisites, canRun: _canRun, runDisabledReason: _reason, ...shellProps } = props
  return <StepShell {...shellProps} {...view} />
}

export function useStepEmptyView({
  onRun,
  onManual,
  onImport,
  prerequisites,
  canRun,
  runDisabledReason,
  ...props
}: StepEmptyProps): StepView {
  const { t, i18n } = useLingui()
  const { label, plugin, pages, frame } = props
  const [scope, setScope] = useState<ScopeKey>("book")

  const stageRun = useStageRun(label, plugin.slug)
  const activity = useOptionalStageActivity(plugin.slug)
  const run = useRunActivity()
  const prereq = useStepPrereq(label, plugin.slug)
  const packageActivity = useOptionalStageActivity("package")
  const landingRunning =
    plugin.slug === "validation" && (packageActivity?.isActive ?? false)
  const failed = useStageStatus(plugin.slug).hasError
  const runningView = useStepRunningView({ ...props, stage: activity ?? null, isCancelling: run.isCancelling, onCancel: run.cancelRun })

  const name = getStageLabelI18n(plugin.slug)
  const prereqReason = stepPrereqReason(plugin.slug)
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
    (!stageRun.isRunnable ? null : !stageRun.hasProvider ? (
      <Trans>Set up AI access in Book settings to run {name}.</Trans>
    ) : null)
  )

  if (activity?.isActive) return runningView

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
              met: stageRun.hasProvider,
              label: t`AI access set up for this book`,
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
      running={landingRunning}
    />
  )

  const pagesReady = t`${plural(pages.length, { one: "# page ready", other: "# pages ready" })}`
  const statusChip = failed ? t`Failed` : t`Never run`

  if (hasStepLanding(plugin.slug)) {
    return {
      bodyViewportClassName: hasFullHeightLanding(plugin.slug) ? "px-0 [&>div]:h-full [&>div]:w-full" : undefined,
      chips: landingRunning
        ? []
        : [
            statusChip,
            ...(!prereq.isMet && prereq.upstreamLabel
              ? [t`Needs ${prereq.upstreamLabel}`]
              : plugin.slug === "extract"
                ? []
                : [pagesReady]),
          ],
      rail,
      railEmpty: true,
      children: <StepLanding label={label} slug={plugin.slug} beforeRun={<PreRunChecklist items={checklist} />} />,
    }
  }

  return {
    chips: [statusChip, pagesReady],
    rail,
    railEmpty: true,
    children: (
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
    ),
  }
}

export interface StepRunningProps extends StepProps {
  stage: RunStageActivity
  isCancelling?: boolean
  onCancel?: () => void
  outcome?: React.ReactNode
}

export function StepRunning({ stage, isCancelling, onCancel, outcome, ...props }: StepRunningProps) {
  const view = useStepRunningView({ ...props, stage, isCancelling, onCancel, outcome })
  return <StepShell {...props} {...view} />
}

export function useStepRunningView({
  stage,
  isCancelling,
  onCancel,
  outcome,
  ...props
}: Omit<StepRunningProps, "stage"> & { stage: RunStageActivity | null }): StepView {
  const { plugin, pages, frame } = props
  const checklist = (progressCounts(stage)?.done ?? 0) === 0
  return {
    chips: [],
    railEmpty: true,
    bodyViewportClassName: checklist ? "[&>div]:my-auto" : undefined,
    rail: (
      <PluginRailEmpty
        hex={plugin.hex}
        title={getStageLabelI18n(plugin.slug)}
        pageCount={pages.length}
        sectionCount={frame.sectionCount}
        running
      />
    ),
    children: !stage ? null : checklist ? (
        <RunChecklist stage={stage} outcome={outcome} />
      ) : (
        <LiveRunPanel stage={stage} total={pages.length || 12} outcome={outcome} label={props.label} pages={pages} />
      ),
  }
}
export interface StepLoadingOptions {
  shape?: StepLoadingShape
}

export function StepLoading({ shape, ...props }: StepProps & StepLoadingOptions) {
  const view = useStepLoadingView(props, { shape })
  return <StepShell {...props} {...view} />
}

export function useStepLoadingView(props: StepProps, { shape: requested }: StepLoadingOptions = {}): StepView {
  const { label, pages, plugin } = props
  const shape = requested ?? stepLoadingShape(plugin.slug)
  const aspect = usePageAspect(label, pages)
  const search = useSearch({ strict: false })
  const pageOpen = typeof search.page === "string" && search.page !== ""
  return {
    chips: [],
    railEmpty: !pageOpen,
    rail: <StepRailSkeleton thumbClassName={pages[0] ? aspect.railThumbClassOf(pages[0]) : "h-[52px] w-[38px]"} />,
    children: <StageContentSkeleton shape={shape} ratio={aspect.ratio} slug={plugin.slug} />,
  }
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
