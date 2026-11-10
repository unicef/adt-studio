import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { CollapsingRunStrip } from "@/components/app/screens/pipeline/runs/CollapsingRunStrip"
import { ReviewerValidationSummaryTab } from "@/components/validation/ReviewerValidationSummaryTab"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import { useAllPagesPruned } from "@/hooks/use-all-pages-pruned"
import { useReviewerValidationCatalog, useReviewerValidationSessions } from "@/hooks/use-reviewer-validation"
import { cn } from "@/lib/utils"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepBody } from "./shared/ui"
import { useStageSurface } from "./shared/useStageSurface"
import type { StepProps } from "./shared/types"
import { AccessibilityReport } from "./validation/AccessibilityReport"
import { RecheckButton } from "./validation/RecheckButton"
import { ValidationRail } from "./validation/ValidationRail"
import { AllPrunedNotice, PackagingFailedNotice, ReportUnreadableNotice, usePackagingWarningNote } from "./validation/ValidationNotices"
import { useValidationRun } from "./validation/useValidationRun"
import { useValidationTab } from "./validation/useValidationTab"

export function ValidationStep(props: StepProps) {
  const { label, plugin, frame, pages } = props
  const { t } = useLingui()
  const assessment = useAccessibilityAssessment(label)
  const catalog = useReviewerValidationCatalog(label)
  const sessions = useReviewerValidationSessions(label)
  const pruned = useAllPagesPruned(label)
  const run = useValidationRun(label, plugin)
  const reviewerEnabled = catalog.data?.enabled ?? false
  const [tab, setTab] = useValidationTab(label, reviewerEnabled)
  const report = assessment.data?.assessment ?? null
  const hasOutput = report !== null
  const warningNote = usePackagingWarningNote(run.warning)
  const outcome = t`The results update when the check finishes.`

  const surface = useStageSurface({
    label,
    slug: "validation",
    hex: plugin.hex,
    ready: true,
    outcome,
    hint: {
      title: t`How the accessibility check works`,
      body: t`We package the book and run automatic accessibility checks on every page. Problems are things to fix. Items to check are ones the checker couldn't decide on, so look at those yourself. Fix problems in the stage they come from, then check again.`,
    },
    notes: warningNote ? [warningNote] : [],
    onOpenPage: () => frame.onOpenPreview(null),
    hasOutput,
  })

  const loading = useStepLoading(props, { isLoading: assessment.isLoading || pruned.isLoading, hasOutput })
  const loadingView = useStepLoadingView(props, { shape: "report" })
  const runningView = useStepRunningView({ ...props, stage: run.activity, outcome })
  const emptyView = useStepEmptyView({
    ...props,
    onRun: run.run,
    canRun: !pruned.allPruned,
    prerequisites: [
      {
        key: "storyboard",
        met: frame.hasSections,
        label: t`Sections generated — ${frame.sectionCount} sections`,
      },
    ],
  })

  const blocked = pruned.allPruned
  const canCheck = !run.active && !blocked
  const openStoryboard = frame.onBack
  const stageName = getStageLabelI18n("validation")

  if (loading) return <StepShell {...props} {...loadingView} />

  if (!report) {
    if (run.active) return <StepShell {...props} {...runningView} />
    const readError = assessment.error ? assessment.error.message || t`The report couldn't be read.` : null
    if (!blocked && !run.error && !readError) return <StepShell {...props} {...emptyView} />
    return (
      <StepShell {...props} chips={[]} rail={emptyView.rail} railEmpty>
        <StepBody title={stageName} width="reading">
          {blocked ? (
            <AllPrunedNotice hex={plugin.hex} onOpenStoryboard={openStoryboard} />
          ) : run.error ? (
            <PackagingFailedNotice error={run.error} hex={plugin.hex} hasResults={false} onRetry={run.run} disabled={!canCheck} />
          ) : (
            readError && <ReportUnreadableNotice error={readError} hex={plugin.hex} onRetry={run.run} disabled={!canCheck} />
          )}
        </StepBody>
      </StepShell>
    )
  }

  const { summary } = report
  const sessionCount = sessions.data?.sessions.length ?? 0
  const reviewer = tab === "reviewer"
  const meta = reviewer
    ? t`${plural(sessionCount, { one: "# review", other: "# reviews" })}`
    : t`${plural(summary.violationCount, { one: "# problem", other: "# problems" })} · ${plural(summary.incompleteCount, { one: "# to check", other: "# to check" })} · ${plural(summary.pageCount, { one: "# page", other: "# pages" })}`

  return (
    <StepShell
      {...props}
      chips={[]}
      rail={
        <ValidationRail
          hex={plugin.hex}
          tab={tab}
          onTab={setTab}
          issueCount={summary.violationCount}
          reviewCount={summary.incompleteCount}
          reviewerEnabled={reviewerEnabled}
          sessionCount={sessionCount}
        />
      }
    >
      <StepBody
        title={reviewer ? t`Reviews` : stageName}
        meta={meta}
        titleExtra={surface.help}
        width="reading"
        actions={<RecheckButton onClick={run.run} disabled={!canCheck} />}
      >
        <CollapsingRunStrip stage={run.activity} outcome={<Trans>The results below are from the last check. They update when this one finishes.</Trans>} />
        {blocked && <AllPrunedNotice hex={plugin.hex} onOpenStoryboard={openStoryboard} />}
        {run.error && !blocked && (
          <PackagingFailedNotice error={run.error} hex={plugin.hex} hasResults onRetry={run.run} disabled={!canCheck} />
        )}
        {!run.active && !run.error && !blocked && surface.top}
        <div
          aria-busy={run.active}
          className={cn(
            "flex flex-col gap-4 transition-opacity duration-300 ease-out motion-reduce:transition-none",
            run.active && "pointer-events-none opacity-55",
          )}
        >
          {reviewer ? (
            <div className="-m-6">
              <ReviewerValidationSummaryTab
                label={label}
                onOpenPreview={() => frame.onOpenPreview(null)}
                onOpenPreviewToPage={frame.onOpenPreviewHref}
              />
            </div>
          ) : (
            <AccessibilityReport assessment={report} hex={plugin.hex} bookPages={pages} onOpenPage={frame.onOpenPreviewHref} />
          )}
        </div>
      </StepBody>
    </StepShell>
  )
}
