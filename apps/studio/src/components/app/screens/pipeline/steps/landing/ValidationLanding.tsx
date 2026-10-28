import { useVariant } from "@/components/app/lab/variants"
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
  const friendly = useVariant("features") === "suggested"
  const assessment = useAccessibilityAssessment(bookLabel)
  const packageAdt = usePackageAdt()
  const { isTaskRunning } = useBookTasks(bookLabel)
  const storyboard = useStageStatus("storyboard")

  const isRunning = packageAdt.isPending || isTaskRunning("package-adt")
  const isCompleted = Boolean(assessment.data?.assessment)
  const storyboardReady = storyboard.isCompleted || storyboard.isRunning

  return (
    <StepLandingShell
      title={<>{friendly ? <Trans>Accessibility check</Trans> : <Trans>Validation</Trans>}</>}
      description={<Trans> Package the book and run whole-book accessibility checks over the result, so the findings describe exactly what a reader gets. Reviewer notes captured in Preview show up here too. </Trans>}
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
      previewLabel={friendly ? t`Example: check results` : t`Validation Preview`}
      onRun={() => packageAdt.mutate(bookLabel)}
      preview={<ValidationPreview />}
    >

      {!storyboardReady && (
        <LandingPageWarning
          stageSlug="validation"
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
