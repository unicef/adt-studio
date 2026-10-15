import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { BookOpen, FileText, ScanText, SkipForward, Sparkles } from "lucide-react"
import { BASE_URL } from "@/api/client"
import { usePages } from "@/hooks/use-pages"
import { useBookRun } from "@/hooks/use-book-run"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { BookInfoPopover } from "@/components/app/screens/pipeline/chrome/BookInfoPopover"
import { NextStepCard } from "@/components/app/screens/pipeline/chrome/NextStepCard"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useExtractRun } from "@/components/app/screens/pipeline/runs/useExtractRun"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepBody, StepRail } from "./shared/ui"
import { usePageDetailKeys } from "./shared/usePageDetailKeys"
import { useDetailFocus, usePageParam } from "./shared/usePageParam"
import { ExtractPageDetail } from "./extract/ExtractPageDetail"
import { ExtractPageGrid } from "./extract/ExtractPageGrid"
import { LiveRunStrip, progressCounts } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import { ExtractRunBanner } from "./extract/ExtractRunBanner"
import { useSpreadReview } from "./extract/useSpreadReview"
import type { StepProps } from "./shared/types"
import type { StepNote } from "./shared/notes/NoteRow"
import { NotesStrip } from "./shared/notes/NotesStrip"
import { useDescribeProblem } from "./shared/problems/useDescribeProblem"

export function ExtractStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const pdf = useSourcePdfInfo(label)
  const run = useRunActivity()
  const extract = useStageActivity("extract")
  const bookRun = useBookRun()
  const extractRun = useExtractRun(label)
  const describeProblem = useDescribeProblem()
  const pagesQuery = usePages(label)
  const { pageParam, openPage, stepPage, closeDetail } = usePageParam(label, plugin.slug)
  useDetailFocus(pageParam)

  const hasPages = pages.length > 0
  const warnCount = useMemo(
    () => pages.filter((page) => page.extractionWarning).length,
    [pages],
  )
  const currentIndex = useMemo(
    () => (pageParam ? pages.findIndex((page) => page.pageId === pageParam) : -1),
    [pages, pageParam],
  )
  const selectedPage = currentIndex >= 0 ? pages[currentIndex] : null
  const spreads = useSpreadReview(label, pages)
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
                { label: t`Review spreads`, onClick: reviewSpreads, primary: true, disabled: spreads.extractRunning },
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
  const notes = [spreadsNote, skippedNote, scannedNote].filter((note): note is StepNote => note !== null)
  const runProblem = extractRun.hasError && !extract.isActive ? describeProblem("extract", run.error, pages) : null
  const partial = runProblem?.level === "partial"
  const firstFailed = runProblem?.pages[0]
  const partialConfirm =
    partial && runProblem
      ? {
          title: runProblem.title,
          body: firstFailed
            ? t`Sectioning will still run on every page. Page ${firstFailed.pageNumber} may be missing some text or images until you fix it.`
            : t`Sectioning will still run on every page. Some pages may be missing text or images until you fix them.`,
          reviewLabel: firstFailed ? t`Open page ${firstFailed.pageNumber}` : t`Try again`,
          onReview: () => (firstFailed ? openPage(firstFailed.pageId) : extractRun.run()),
        }
      : null
  const bannerConfirm =
    spreads.eligible && spreads.confirmCount > 0
      ? {
          title: t`Review spreads first?`,
          body: t`We think pages ${pairs} are two-page spreads. Sectioning works page by page, so merge them first to keep each illustration together.`,
          reviewLabel: t`Review spreads`,
          onReview: reviewSpreads,
        }
      : null
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
    hasOutput: hasPages,
  })

  const runningView = useStepRunningView({
    ...props,
    stage: extract,
    isCancelling: run.isCancelling,
    onCancel: run.cancelRun,
    outcome: t`Each page shows up here — text, fonts and images — as it is extracted.`,
  })
  const loadingView = useStepLoadingView(props)
  const pdfPages = pdf.data?.pageCount ?? 0
  const emptyView = useStepEmptyView({
    ...props,
    prerequisites: [
      {
        key: "pdf",
        met: pdfPages > 0,
        label: t`Source PDF uploaded — ${plural(pdfPages, { one: "# page", other: "# pages" })}`,
      },
    ],
  })
  const phaseView = extract.isActive && !hasPages ? runningView : loading ? loadingView : !hasPages ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  return (
    <StepShell
      {...props}
      railEmpty={!selectedPage}
      chips={[
        t`${plural(pages.length, { one: "# page", other: "# pages" })}`,
        warnCount > 0
          ? t`${plural(warnCount, { one: "# page recovered from images", other: "# pages recovered from images" })}`
          : t`Text layer on every page`,
      ]}
      canApply={false}

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
          footer={<Trans>Counts show how many images each page contributed.</Trans>}
        />
      }
    >
      <FloatingSaveProvider barClassName="bottom-27">
        <UnsavedChangesGuard />
        {selectedPage ? (
          <ExtractPageDetail
            key={selectedPage.pageId}
            label={label}
            pageId={selectedPage.pageId}
            prevPageId={prevPageId}
            nextPageId={nextPageId}
            onStep={stepPage}
            onClose={closeDetail}
          />
        ) : (
          <StepBody
            title={<Trans>Extraction</Trans>}
            meta={t`${plural(pages.length, { one: "# page", other: "# pages" })}`}
            actions={
              <div className="flex items-center gap-2">
                <BookInfoPopover
                  label={label}
                  withLabel
                  triggerClassName="h-8 rounded-lg border px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
                  triggerStyle={{ borderColor: tint(plugin.hex, 0.3) }}
                />
                <a
                  href={`${BASE_URL}/books/${label}/source-pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium",
                    "text-foreground transition-colors hover:bg-muted",
                  )}
                  style={{ borderColor: tint(plugin.hex, 0.3) }}
                >
                  <FileText className="size-3.5" />
                  <Trans>Open source PDF</Trans>
                </a>
              </div>
            }
          >
            {extract.isActive && <LiveRunStrip stage={extract} />}

            <ExtractRunBanner label={label} run={extractRun} pages={pages} onOpenPage={openPage} />

            <NextStepCard label={label} slug={plugin.slug} partial={partial} confirm={partialConfirm ?? bannerConfirm} />

            <NotesStrip notes={notes} hex={plugin.hex} />
            {spreads.picker}

            <ExtractPageGrid
              label={label}
              pages={pages}
              onOpen={openPage}
              hex={plugin.hex}
              pendingCount={
                extract.isActive
                  ? Math.max(0, (progressCounts(extract)?.total ?? pages.length) - pages.length)
                  : 0
              }
            />
          </StepBody>
        )}
      </FloatingSaveProvider>
    </StepShell>
  )
}
