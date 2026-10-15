import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { usePages } from "@/hooks/use-pages"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { NextStepCard } from "@/components/app/screens/pipeline/chrome/NextStepCard"
import { useDescribeProblem } from "./shared/problems/useDescribeProblem"
import { RunErrorNotice } from "./shared/RunErrorNotice"
import { useStageStatus } from "@/hooks/use-stage-status"
import { LiveRunStrip } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useSectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepBody, StepRail } from "./shared/ui"
import { usePageDetailKeys } from "./shared/usePageDetailKeys"
import { useDetailFocus, usePageParam } from "./shared/usePageParam"
import { SectioningPageDetail } from "./sectioning/SectioningPageDetail"
import { SectioningPageGrid } from "./sectioning/SectioningPageGrid"
import type { StepProps } from "./shared/types"

export function SectioningStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const run = useRunActivity()
  const sectioning = useStageActivity("sectioning")
  const extract = useStageActivity("extract")
  const sectioningRun = useSectioningRun(label)
  const failed = useStageStatus("sectioning").hasError
  const describeProblem = useDescribeProblem()
  const pagesQuery = usePages(label)
  const { pageParam, openPage, stepPage, closeDetail } = usePageParam(label, plugin.slug)
  useDetailFocus(pageParam)
  const sectionProblem = failed && !sectioning.isActive ? describeProblem("sectioning", run.error, pages) : null
  const firstFailed = sectionProblem?.pages[0]

  const sectionedCount = useMemo(
    () => pages.reduce((sum, page) => sum + (page.sectionCount > 0 ? 1 : 0), 0),
    [pages],
  )
  const total = useMemo(() => pages.reduce((sum, page) => sum + page.sectionCount, 0), [pages])
  const pruned = useMemo(
    () => pages.reduce((sum, page) => sum + page.prunedSections.length, 0),
    [pages],
  )

  const currentIndex = useMemo(
    () => (pageParam ? pages.findIndex((page) => page.pageId === pageParam) : -1),
    [pages, pageParam],
  )
  const selectedPage = currentIndex >= 0 ? pages[currentIndex] : null
  const pageAspect = usePageAspect(label, pages)
  const prevPageId = currentIndex > 0 ? pages[currentIndex - 1].pageId : null
  const nextPageId =
    currentIndex >= 0 && currentIndex < pages.length - 1 ? pages[currentIndex + 1].pageId : null

  usePageDetailKeys({
    enabled: !!selectedPage,
    prevPageId,
    nextPageId,
    onStep: stepPage,
  })

  const loading = useStepLoading(props, {
    isLoading: pagesQuery.isPending,
    hasOutput: sectionedCount > 0,
  })

  const feeding = sectioning.isActive ? sectioning : extract.isActive ? extract : null
  const runningView = useStepRunningView({
    ...props,
    stage: feeding,
    isCancelling: run.isCancelling,
    onCancel: run.cancelRun,
    outcome: t`Sections show up here as each page is structured.`,
  })
  const loadingView = useStepLoadingView(props)
  const emptyView = useStepEmptyView({
    ...props,
    onRun: sectioningRun.run,
    canRun: sectioningRun.canRun,
    runDisabledReason: sectioningRun.hasApiKey ? undefined : <Trans>Add an API key in Book settings to run sectioning.</Trans>,
    prerequisites: [
      {
        key: "pages",
        met: pages.length > 0,
        label: t`Pages extracted — ${plural(pages.length, { one: "# page", other: "# pages" })}`,
      },
      {
        key: "api-key",
        met: sectioningRun.hasApiKey,
        label: t`API key set in Book settings`,
      },
    ],
  })
  const phaseView =
    feeding && sectionedCount === 0 ? runningView : loading ? loadingView : sectionedCount === 0 ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  return (
    <StepShell
      {...props}
      railEmpty={!selectedPage}
      chips={[t`${plural(total, { one: "# section", other: "# sections" })}`, pruned > 0 ? t`${pruned} dropped` : t`All kept`]}
      canApply={total - pruned > 0}
      rail={
        <StepRail
          heading={<Trans>Sections by page</Trans>}
          hex={plugin.hex}
          entries={[
            { key: "", title: t`All pages`, count: total },
            ...pages.map((page) => ({
              key: page.pageId,
              title: t`Page ${page.pageNumber}`,
              count: page.sectionCount,
              subtitle: page.textPreview?.replace(/\n/g, " ") || undefined,
              thumb: (
                <PageThumb
                  label={label}
                  pageId={page.pageId}
                  sectionIndex={null}
                  className={pageAspect.railThumbClassOf(page)}
                />
              ),
            })),
          ]}
          activeKey={selectedPage?.pageId ?? ""}
          onSelect={(key) => (key ? openPage(key) : closeDetail())}
          footer={<Trans>Dropped sections stay in the book but never reach the reader.</Trans>}
        />
      }
    >
      <FloatingSaveProvider barClassName="bottom-27">
        <UnsavedChangesGuard />
        {selectedPage ? (
          <SectioningPageDetail
            label={label}
            pageId={selectedPage.pageId}
            accent={plugin.hex}
            prevPageId={prevPageId}
            nextPageId={nextPageId}
            onStep={stepPage}
            onClose={closeDetail}
          />
        ) : (
          <StepBody title={<Trans>Sectioning</Trans>} meta={t`${plural(total, { one: "# section", other: "# sections" })}`}>
            {sectioning.isActive && (
              <LiveRunStrip stage={sectioning} outcome={t`Sections show up here as each page is structured.`} />
            )}
            {failed && (
              <RunErrorNotice
                label={label}
                stage="sectioning"
                hex={plugin.hex}
                pages={pages}
                onOpenPage={openPage}
                onRetry={sectioningRun.run}
                canRetry={sectioningRun.canRun}
              />
            )}
            <NextStepCard
              label={label}
              slug={plugin.slug}
              partial={sectionProblem?.level === "partial"}
              confirm={
                sectionProblem?.level === "partial"
                  ? {
                      title: sectionProblem.title,
                      body: firstFailed
                        ? t`The storyboard will still be built. Page ${firstFailed.pageNumber} may have missing sections until you fix it.`
                        : t`The storyboard will still be built. Some pages may have missing sections until you fix them.`,
                      reviewLabel: firstFailed ? t`Open page ${firstFailed.pageNumber}` : t`Try again`,
                      onReview: () => (firstFailed ? openPage(firstFailed.pageId) : sectioningRun.run()),
                    }
                  : null
              }
            />
            <SectioningPageGrid label={label} pages={pages} onOpen={openPage} />
          </StepBody>
        )}
      </FloatingSaveProvider>
    </StepShell>
  )
}
