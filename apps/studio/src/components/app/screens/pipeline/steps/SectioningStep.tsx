import { useMemo } from "react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { usePages } from "@/hooks/use-pages"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { NextStepCardView } from "@/components/app/screens/pipeline/chrome/NextStepCard"
import { useStageProblem } from "./shared/problems/useStageProblem"
import { RunErrorNotice } from "./shared/RunErrorNotice"
import { CollapsingRunStrip } from "@/components/app/screens/pipeline/runs/CollapsingRunStrip"
import { nextStepFolds, useNextStep } from "@/components/app/screens/pipeline/shared/useNextStep"
import { FoldedProblem } from "./shared/problems/FoldedProblem"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useSectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun"
import { useStageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import { useRerunConfirm } from "@/components/app/screens/pipeline/runs/useRerunConfirm"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepBody, StepRail } from "./shared/ui"
import { usePageNav } from "./shared/usePageNav"
import { SectioningPageDetail } from "./sectioning/SectioningPageDetail"
import { SectioningPageGrid } from "./sectioning/SectioningPageGrid"
import type { StepProps } from "./shared/types"
import { useVariants } from "@/components/app/lab/variants"
import { NotesStrip } from "./shared/notes/NotesStrip"
import { ExtractHeaderActions } from "./extract/ExtractHeaderActions"
import { SectioningRunBanner } from "./sectioning/SectioningRunBanner"
import { SectioningWaitStrip } from "./sectioning/SectioningWaitStrip"
import { useSectioningNotes } from "./sectioning/useSectioningNotes"

export function SectioningStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const run = useRunActivity()
  const sectioning = useStageActivity("sectioning")
  const extract = useStageActivity("extract")
  const sectioningRun = useSectioningRun(label)
  const retry = useRerunConfirm("sectioning", useStageRerun(label, "sectioning"))
  const pagesQuery = usePages(label)
  const variants = useVariants()
  const {
    selected: selectedPage,
    prevId: prevPageId,
    nextId: nextPageId,
    open: openPage,
    step: stepPage,
    close: closeDetail,
  } = usePageNav({ label, slug: plugin.slug, pages })
  const stageProblem = useStageProblem({
    stage: "sectioning",
    pages,
    retry: retry.request,
    onOpenPage: openPage,
    partialBody: (first) =>
      first
        ? t`The storyboard will still be built. Page ${first.pageNumber} may have missing sections until you fix it.`
        : t`The storyboard will still be built. Some pages may have missing sections until you fix them.`,
  })

  const next = useNextStep(label, plugin.slug, { partial: stageProblem.partial })
  const foldProblem = nextStepFolds(next) && stageProblem.partial

  const sectionedCount = useMemo(
    () => pages.reduce((sum, page) => sum + (page.sectionCount > 0 ? 1 : 0), 0),
    [pages],
  )
  const total = useMemo(() => pages.reduce((sum, page) => sum + page.sectionCount, 0), [pages])
  const pruned = useMemo(
    () => pages.reduce((sum, page) => sum + page.prunedSections.length, 0),
    [pages],
  )

  const pageAspect = usePageAspect(label, pages)

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
    runDisabledReason: sectioningRun.hasProvider ? undefined : <Trans>Set up AI access in Book settings to run sectioning.</Trans>,
    prerequisites: [
      {
        key: "pages",
        met: pages.length > 0,
        label: t`Pages extracted — ${plural(pages.length, { one: "# page", other: "# pages" })}`,
      },
      {
        key: "api-key",
        met: sectioningRun.hasProvider,
        label: t`AI access set up for this book`,
      },
    ],
  })
  const notes = useSectioningNotes({ pages, sectioning, busy: feeding !== null, onOpenPage: openPage })
  const gridRun = variants.sectrunning === "grid"
  const straightToGrid = gridRun && feeding !== null && pages.length > 0
  const phaseView = straightToGrid
    ? null
    : feeding && sectionedCount === 0 ? runningView : loading ? loadingView : sectionedCount === 0 ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  return (
    <StepShell
      {...props}
      railEmpty={!selectedPage}
      chips={straightToGrid && sectionedCount === 0 ? [] : [t`${plural(total, { one: "# section", other: "# sections" })}`, pruned > 0 ? t`${pruned} dropped` : t`All kept`]}
      rail={
        <StepRail
          heading={variants.sectrail === "pages" ? <Trans>Pages</Trans> : <Trans>Sections by page</Trans>}
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
      {selectedPage ? (
        <SectioningPageDetail
          label={label}
          pageId={selectedPage.pageId}
          pageNumber={selectedPage.pageNumber}
          accent={plugin.hex}
          prevPageId={prevPageId}
          nextPageId={nextPageId}
          onStep={stepPage}
          onClose={closeDetail}
        />
      ) : (
        <StepBody
          title={getStageLabelI18n("sectioning")}
          meta={t`${plural(total, { one: "# section", other: "# sections" })}`}
          actions={variants.secthead === "extract" ? <ExtractHeaderActions label={label} /> : undefined}
        >
          {straightToGrid && !sectioning.isActive ? (
            <SectioningWaitStrip extract={extract} hex={plugin.hex} />
          ) : (
            <CollapsingRunStrip stage={sectioning} outcome={gridRun ? undefined : t`Sections show up here as each page is structured.`} />
          )}
          {stageProblem.failed && !foldProblem && (
            <RunErrorNotice
              label={label}
              stage="sectioning"
              hex={plugin.hex}
              pages={pages}
              onOpenPage={openPage}
              onRetry={retry.request}
              canRetry={retry.canRun}
              retryReason={retry.disabledReason}
            />
          )}
          {variants.sectresume === "strip" && <SectioningRunBanner run={sectioningRun} />}
          {retry.dialogs}
          <NextStepCardView
            next={next}
            slug={plugin.slug}
            confirm={stageProblem.partialConfirm}
            aside={
              foldProblem ? (
                <FoldedProblem
                  label={label}
                  problem={stageProblem.problem}
                  retry={{ run: retry.request, canRun: retry.canRun, reason: retry.disabledReason }}
                  onOpenPage={openPage}
                />
              ) : null
            }
          />
          {variants.sectnotes === "strip" && <NotesStrip notes={notes} hex={plugin.hex} />}
          <SectioningPageGrid
            label={label}
            pages={pages}
            onOpen={openPage}
            aspect={pageAspect}
            live={gridRun ? { hex: plugin.hex, pending: feeding !== null } : undefined}
          />
        </StepBody>
      )}
    </StepShell>
  )
}
