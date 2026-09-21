import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AccessibilityOverviewTab } from "@/components/validation/AccessibilityValidationTabs"
import { ReviewerValidationSummaryTab } from "@/components/validation/ReviewerValidationSummaryTab"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { usePackageAdt } from "@/hooks/use-books"
import {
  useReviewerValidationCatalog,
  useReviewerValidationSessions,
} from "@/hooks/use-reviewer-validation"
import { StepEmpty, StepLoading, StepShell, useStepLoading } from "./shared/StepShell"
import { StepRail } from "./shared/ui"
import type { StepProps } from "./shared/types"

type ValidationTab = "accessibility" | "reviewer"

export function ValidationStep(props: StepProps) {
  const { label, plugin, frame } = props
  const { t } = useLingui()
  const assessment = useAccessibilityAssessment(label)
  const catalog = useReviewerValidationCatalog(label)
  const sessions = useReviewerValidationSessions(label)
  const packageAdt = usePackageAdt()
  const { isTaskRunning } = useBookTasks(label)
  const [tab, setTab] = useState<ValidationTab>("accessibility")

  const reviewerEnabled = catalog.data?.enabled ?? false
  const packaging = packageAdt.isPending || isTaskRunning("package-adt")
  const repackage = () => packageAdt.mutate(label)

  const openPreviewToPage = (href: string) => frame.onOpenPreviewHref(href)

  const loading = useStepLoading(props, {
    isLoading: assessment.isLoading,
    hasOutput: Boolean(assessment.data?.assessment),
  })

  if (loading || packaging) return <StepLoading {...props} />

  if (!assessment.data?.assessment) {
    return (
      <StepEmpty
        {...props}
        onRun={repackage}
        canRun
        prerequisites={[
          {
            key: "storyboard",
            met: frame.hasSections,
            label: t`Sections generated — ${frame.sectionCount} sections`,
          },
        ]}
      />
    )
  }

  const summary = assessment.data.assessment.summary
  const activeTab = reviewerEnabled ? tab : "accessibility"

  return (
    <StepShell
      {...props}
      chips={[
        summary.violationCount === 1 ? t`1 issue` : t`${summary.violationCount} issues`,
        summary.pageCount === 1 ? t`1 page checked` : t`${summary.pageCount} pages checked`,
      ]}
      canApply={false}
      rail={
        <StepRail
          heading={<Trans>Checks</Trans>}
          hex={plugin.hex}
          entries={[
            { key: "accessibility", title: t`Accessibility`, count: summary.violationCount },
            ...(reviewerEnabled
              ? [
                  {
                    key: "reviewer",
                    title: t`Reviewer findings`,
                    count: sessions.data?.sessions.length ?? 0,
                  },
                ]
              : []),
          ]}
          activeKey={activeTab}
          onSelect={(key) => setTab(key === "reviewer" ? "reviewer" : "accessibility")}
          footer={
            <Trans>
              Whole-book checks on the packaged output, plus reviewer findings captured from
              Preview.
            </Trans>
          }
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-end border-b px-4 py-2">
          <Button variant="outline" size="sm" onClick={repackage} disabled={packaging}>
            <RotateCcw className="size-3.5" />
            <Trans>Refresh validation</Trans>
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {activeTab === "accessibility" ? (
            <AccessibilityOverviewTab label={label} onOpenPage={openPreviewToPage} />
          ) : (
            <ReviewerValidationSummaryTab
              label={label}
              onOpenPreview={() => frame.onOpenPreview(null)}
              onOpenPreviewToPage={openPreviewToPage}
            />
          )}
        </div>
      </div>
    </StepShell>
  )
}
