import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { usePages } from "@/hooks/use-pages"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useSectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { StepEmpty, StepLoading, StepRunning, StepShell, useStepLoading } from "./shared/StepShell"
import { StepBody, StepRail } from "./shared/ui"
import { usePageDetailKeys } from "./shared/usePageDetailKeys"
import { usePageParam } from "./shared/usePageParam"
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
  const pagesQuery = usePages(label)
  const { pageParam, openPage, stepPage, closeDetail } = usePageParam(label, plugin.slug)

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
  if (feeding && sectionedCount === 0) {
    return (
      <StepRunning
        {...props}
        stage={feeding}
        isCancelling={run.isCancelling}
        onCancel={run.cancelRun}
        outcome={t`Sections show up here as each page is structured.`}
      />
    )
  }
  if (loading) return <StepLoading {...props} />
  if (sectionedCount === 0) {
    return (
      <StepEmpty
        {...props}
        onRun={sectioningRun.run}
        canRun={sectioningRun.canRun}
        runDisabledReason={
          sectioningRun.hasApiKey ? undefined : (
            <Trans>Add an API key in Book settings to run sectioning.</Trans>
          )
        }
        prerequisites={[
          {
            key: "pages",
            met: pages.length > 0,
            label: t`Pages extracted — ${pages.length} pages`,
          },
          {
            key: "api-key",
            met: sectioningRun.hasApiKey,
            label: t`API key set in Book settings`,
          },
        ]}
      />
    )
  }

  return (
    <StepShell
      {...props}
      chips={[t`${total} sections`, pruned > 0 ? t`${pruned} dropped` : t`All kept`]}
      canApply={total - pruned > 0}
      bodyViewportClassName="[&>div]:!my-0"
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
                  className="h-[52px] w-[38px]"
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
          <StepBody title={<Trans>Sectioning</Trans>} meta={t`${total} sections`}>
            <SectioningPageGrid label={label} pages={pages} onOpen={openPage} />
          </StepBody>
        )}
      </FloatingSaveProvider>
    </StepShell>
  )
}
