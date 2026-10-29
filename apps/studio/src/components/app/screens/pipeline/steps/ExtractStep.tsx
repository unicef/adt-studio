import { useMemo } from "react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { BookOpen, FileSearch, RotateCcw, ScanText, SkipForward, Sparkles, TriangleAlert } from "lucide-react"
import { usePages } from "@/hooks/use-pages"
import { useBookRun } from "@/hooks/use-book-run"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { useBookConfig } from "@/hooks/use-book-config"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { expectedRunRatio, usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { countGroups } from "@/components/app/screens/pipeline/shared/groupPages"
import { nextStepFolds, useNextStep } from "@/components/app/screens/pipeline/shared/useNextStep"
import { NextStepCardView } from "@/components/app/screens/pipeline/chrome/NextStepCard"
import { useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useExtractRun } from "@/components/app/screens/pipeline/runs/useExtractRun"
import { useStageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import { useRerunConfirm } from "@/components/app/screens/pipeline/runs/useRerunConfirm"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView } from "./shared/StepShell"
import { StepBody, StepRail, STEP_FILL_VIEWPORT_CLASSNAME } from "./shared/ui"
import { usePageNav } from "./shared/usePageNav"
import { ExtractPageDetail } from "./extract/page-detail/ExtractPageDetail"
import { ExtractPageGrid } from "./extract/ExtractPageGrid"
import { progressCounts } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import { CollapsingRunStrip } from "@/components/app/screens/pipeline/runs/CollapsingRunStrip"
import { ExtractRunBanner } from "./extract/ExtractRunBanner"
import { ExtractHeaderActions } from "./extract/ExtractHeaderActions"
import { useSpreadReview } from "./extract/useSpreadReview"
import type { StepProps } from "./shared/types"
import type { StepNote } from "./shared/notes/NoteRow"
import { NotesStrip } from "./shared/notes/NotesStrip"
import { useStageProblem } from "./shared/problems/useStageProblem"
import { FoldedProblem, type ProblemRetry } from "./shared/problems/FoldedProblem"
import { largeRailThumbClass } from "./shared/rail/railThumb"
import { ProblemNotice } from "./shared/problems/ProblemNotice"

export function ExtractStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const pdf = useSourcePdfInfo(label)
  const { data: bookConfigData } = useBookConfig(label)
  const extract = useStageActivity("extract")
  const bookRun = useBookRun()
  const extractRun = useExtractRun(label)
  const retry = useRerunConfirm("extract", useStageRerun(label, "extract"))
  const pagesQuery = usePages(label)
  const {
    selected: selectedPage,
    prevId: prevPageId,
    nextId: nextPageId,
    open: openPage,
    step: stepPage,
    close: closeDetail,
  } = usePageNav({ label, slug: plugin.slug, pages })

  const hasPages = pages.length > 0
  const warnCount = useMemo(
    () => pages.filter((page) => page.extractionWarning).length,
    [pages],
  )
  const spreads = useSpreadReview(label, pages)
  const metadataRunning = bookRun.stepState("metadata") === "running"
  const spreadsBusyReason = spreads.extractRunning ? t`Extract is still running. You can review spreads once it finishes.` : undefined
  const metadataNote: StepNote | null =
    metadataRunning
      ? {
          id: "metadata",
          icon: FileSearch,
          title: t`Processing metadata…`,
          body: t`The title, authors and summary are being read from the book. They show in Book info when this finishes.`,
          busy: true,
        }
      : null
  const spreadsPending = spreads.eligible && (spreads.confirmCount > 0 || spreads.applying)
  const pairs = spreads.toConfirm.map((suggestion) => `${suggestion.lead}–${suggestion.lead + 1}`).join(", ")
  const reviewSpreads = () => spreads.openPicker("spreads", spreads.pendingLeads)
  const scannedNote: StepNote | null =
    warnCount > 0
      ? {
          id: "scanned",
          icon: ScanText,
          title: t`${plural(warnCount, { one: "# page was read from images", other: "# pages were read from images" })}`,
          body: t`These pages have no text layer, so their text was read from the page pictures. That works, but a digital PDF (one you can select text in) gives better summaries and translations.`,
        }
      : null
  const spreadsNote: StepNote | null = !spreads.eligible
    ? null
    : spreadsPending
      ? {
          id: "spreads",
          icon: Sparkles,
          title: spreads.applying
            ? t`Merging spreads…`
            : t`${plural(spreads.confirmCount, { one: "# possible spread to review", other: "# possible spreads to review" })}`,
          body: t`We compared the page edges and think pages ${pairs} are two-page spreads. Merge them so each illustration stays together; nothing changes until you do.`,
          attention: true,
          busy: spreads.applying,
          actions: spreads.applying
            ? []
            : [
                { label: t`Review spreads`, onClick: reviewSpreads, primary: true, disabled: spreads.extractRunning, disabledReason: spreadsBusyReason },
                { label: t`Not spreads`, onClick: spreads.dismissAll, quiet: true },
              ],
        }
      : {
          id: "spreads",
          icon: BookOpen,
          title: spreads.mergedCount > 0 ? t`${plural(spreads.mergedCount, { one: "# spread merged", other: "# spreads merged" })}` : t`Two-page spreads`,
          body:
            spreads.mergedCount > 0
              ? t`These facing pages were merged into one, so their illustration stays together.`
              : t`If an illustration runs across two facing pages, merge the pair so it stays together. We didn't spot any, but you can mark them yourself.`,
          actions: [
            {
              label: spreads.mergedCount > 0 ? t`Edit spreads` : t`Mark spreads`,
              onClick: () => spreads.openPicker("all"),
              disabled: spreads.extractRunning,
              disabledReason: spreadsBusyReason,
            },
          ],
        }
  const skippedSteps = extract.steps
    .map((step) => ({ label: step.label, count: Number(/(\d+) page\(s\) skipped/.exec(bookRun.stepMessage?.(step.name) ?? "")?.[1] ?? 0) }))
    .filter((step) => step.count > 0)
  const skippedCount = skippedSteps.reduce((total, step) => total + step.count, 0)
  const skippedNames = skippedSteps.map((step) => step.label).join(", ")
  const skippedNote: StepNote | null =
    skippedCount > 0
      ? {
          id: "skipped",
          icon: SkipForward,
          title: t`${plural(skippedCount, { one: "# page was skipped", other: "# pages were skipped" })}`,
          body: t`${skippedNames} couldn't process them, so the run went on without them. Re-run Extract to try them again.`,
        }
      : null
  const notes = [metadataNote, spreadsNote, skippedNote, scannedNote].filter((note): note is StepNote => note !== null)
  const { problem, partial, partialConfirm } = useStageProblem({
    stage: "extract",
    pages,
    retry: retry.request,
    onOpenPage: openPage,
    partialBody: (first) =>
      first
        ? t`Sectioning will still run on every page. Page ${first.pageNumber} may be missing some text or images until you fix it.`
        : t`Sectioning will still run on every page. Some pages may be missing text or images until you fix them.`,
  })
  const bannerConfirm =
    spreads.eligible && spreads.confirmCount > 0
      ? {
          title: t`Review spreads first?`,
          body: t`We think pages ${pairs} are two-page spreads. Sectioning works page by page, so merge them first to keep each illustration together.`,
          reviewLabel: t`Review spreads`,
          onReview: reviewSpreads,
        }
      : null
  const failedPageIds = new Set(problem?.level === "partial" ? problem.pages.map((page) => page.pageId) : [])
  const retryAction: ProblemRetry = { run: retry.request, canRun: retry.canRun, reason: retry.disabledReason }
  const next = useNextStep(label, plugin.slug, { partial })
  const foldProblem = nextStepFolds(next) && partial
  const config = bookConfigData?.config
  const spread = config?.spread_mode === true
  const pdfPageCount = pdf.data?.pageCount ?? 0
  const rangeStart = config?.start_page != null ? Number(config.start_page) : 1
  const rangeEnd = Math.min(pdfPageCount, config?.end_page != null ? Number(config.end_page) : pdfPageCount)
  const expectedPages = pdfPageCount > 0 ? countGroups(rangeStart, rangeEnd, spread) : 0
  const pageAspect = usePageAspect(label, pages, { expected: extract.isActive ? expectedRunRatio(label, spread) : null })

  const loading = useStepLoading(props, {
    isLoading: pagesQuery.isPending,
    hasOutput: hasPages,
  })

  const loadingView = useStepLoadingView(props)
  const emptyView = useStepEmptyView({
    ...props,
    prerequisites: [
      {
        key: "pdf",
        met: pdfPageCount > 0,
        label: t`Source PDF uploaded — ${plural(pdfPageCount, { one: "# page", other: "# pages" })}`,
      },
    ],
  })
  const phaseView = loading && !extract.isActive ? loadingView : !hasPages && !extract.isActive ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  return (
    <StepShell
      {...props}
      railEmpty={!selectedPage}
      bodyViewportClassName={selectedPage ? STEP_FILL_VIEWPORT_CLASSNAME : undefined}
      chips={
        extract.isActive && !hasPages
          ? []
          : [
              t`${plural(pages.length, { one: "# page", other: "# pages" })}`,
              warnCount > 0
                ? t`${plural(warnCount, { one: "# page recovered from images", other: "# pages recovered from images" })}`
                : t`Text layer on every page`,
            ]
      }
      rail={
        <StepRail
          heading={<Trans>Pages</Trans>}
          hex={plugin.hex}
          entries={[
            { key: "", title: t`All pages`, count: pages.length },
            ...pages.map((page) => ({
              key: page.pageId,
              title: t`Page ${page.pageNumber}`,
              count: page.imageCount,
              subtitle: page.textPreview?.replace(/\n/g, " ") || undefined,
              pageNumber: page.pageNumber,
              failed: failedPageIds.has(page.pageId),
              thumb: <PageThumb label={label} pageId={page.pageId} sectionIndex={null} className={largeRailThumbClass(pageAspect.ratioOf(page))} />,
            })),
          ]}
          activeKey={selectedPage?.pageId ?? ""}
          onSelect={(key) => (key ? openPage(key) : closeDetail())}
          footer={<Trans>Counts show how many images each page contributed.</Trans>}
        />
      }
    >
      {selectedPage ? (
        <>
          <ExtractPageDetail
            key={selectedPage.pageId}
            label={label}
            pageId={selectedPage.pageId}
            pageNumber={selectedPage.pageNumber}
            hex={plugin.hex}
            prevPageId={prevPageId}
            nextPageId={nextPageId}
            onStep={stepPage}
            onClose={closeDetail}
            problem={problem}
            retry={retryAction}
          />
          {retry.dialogs}
        </>
      ) : (
        <StepBody
          title={getStageLabelI18n("extract")}
          meta={t`${plural(pages.length, { one: "# page", other: "# pages" })}`}
          actions={<ExtractHeaderActions label={label} />}
        >
          <CollapsingRunStrip stage={extract} />

          <ExtractRunBanner label={label} run={extractRun} pages={pages} onOpenPage={openPage} retry={retryAction} hidePartial={foldProblem} />
          {retry.dialogs}

          <NextStepCardView
            next={next}
            slug={plugin.slug}
            confirm={partialConfirm ?? bannerConfirm}
            aside={foldProblem ? <FoldedProblem label={label} problem={problem} retry={retryAction} onOpenPage={openPage} /> : null}
          />

          {spreads.applyFailed && !spreads.applying && (
            <ProblemNotice
              level="temporary"
              hex={plugin.hex}
              icon={TriangleAlert}
              title={t`Couldn't apply the spreads`}
              body={t`The pages weren't merged. Try again.`}
              action={{ label: <Trans>Try again</Trans>, icon: RotateCcw, onClick: spreads.retryApply }}
            />
          )}
          <NotesStrip notes={notes} hex={plugin.hex} />
          {spreads.picker}

          <ExtractPageGrid
            label={label}
            pages={pages}
            onOpen={openPage}
            aspect={pageAspect}
            hex={plugin.hex}
            pendingCount={
              extract.isActive
                ? Math.max(0, (progressCounts(extract)?.total || expectedPages || pages.length) - pages.length)
                : 0
            }
          />
        </StepBody>
      )}
    </StepShell>
  )
}
