import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { LandingPageWarning } from "@/components/pipeline/components/LandingPageWarning"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { usePackageAdt } from "@/hooks/use-books"
import { useStageStatus } from "@/hooks/use-stage-status"
import { StepLandingShell } from "./StepLandingShell"
import { ValidationPreview } from "./ui/ValidationPreview"

export function ValidationLanding({
  bookLabel,
  beforeRun,
}: {
  bookLabel: string
  beforeRun?: ReactNode
}) {
  const { t } = useLingui()
  const assessment = useAccessibilityAssessment(bookLabel)
  const packageAdt = usePackageAdt()
  const { isTaskRunning } = useBookTasks(bookLabel)
  const storyboard = useStageStatus("storyboard")

  const isRunning = packageAdt.isPending || isTaskRunning("package-adt")
  const isCompleted = Boolean(assessment.data?.assessment)
  const storyboardReady = storyboard.isCompleted || storyboard.isRunning

  return (
    <StepLandingShell
      beforeRun={beforeRun}
      bookLabel={bookLabel}
      stageSlug="validation"
      isRunning={isRunning}
      isCompleted={isCompleted}
      hasError={packageAdt.isError}
      canRun={storyboardReady}
      disabledReason={
        !storyboardReady ? (
          <Trans>Finish Storyboard first — validation checks the packaged book.</Trans>
        ) : undefined
      }
      runLabel={<Trans>Package and check</Trans>}
      rerunLabel={<Trans>Re-check</Trans>}
      previewLabel={t`Validation Preview`}
      onRun={() => packageAdt.mutate(bookLabel)}
      preview={<ValidationPreview />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          <Trans>Validation</Trans>
        </h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          <Trans>
            Package the book and run whole-book accessibility checks over the
            result, so the findings describe exactly what a reader gets. Reviewer
            notes captured in Preview show up here too.
          </Trans>
        </p>
      </div>

      {!storyboardReady && (
        <LandingPageWarning
          variant="prereq"
          title={<Trans>Storyboard hasn't run yet</Trans>}
          description={
            <Trans>
              There are no rendered pages to package, so there is nothing to check
              yet. Run Storyboard first.
            </Trans>
          }
        />
      )}
    </StepLandingShell>
  )
}
