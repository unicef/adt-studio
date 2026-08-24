import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileText, TriangleAlert } from "lucide-react"
import { BASE_URL } from "@/api/client"
import { usePages } from "@/hooks/use-pages"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useExtractRun } from "@/components/app/screens/pipeline/runs/useExtractRun"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { StepEmpty, StepLoading, StepRunning, StepShell, useStepLoading } from "./shared/StepShell"
import { StepBody, StepRail } from "./shared/ui"
import { usePageDetailKeys } from "./shared/usePageDetailKeys"
import { usePageParam } from "./shared/usePageParam"
import { ExtractPageDetail } from "./extract/ExtractPageDetail"
import { ExtractPageGrid } from "./extract/ExtractPageGrid"
import { ExtractRunBanner } from "./extract/ExtractRunBanner"
import { ExtractSpreadReview } from "./extract/ExtractSpreadReview"
import type { StepProps } from "./shared/types"

export function ExtractStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const pdf = useSourcePdfInfo(label)
  const run = useRunActivity()
  const extract = useStageActivity("extract")
  const extractRun = useExtractRun(label)
  const pagesQuery = usePages(label)
  const { pageParam, openPage, stepPage, closeDetail } = usePageParam(label, plugin.slug)

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

  if (extract.isActive && !hasPages) {
    return (
      <StepRunning
        {...props}
        stage={extract}
        isCancelling={run.isCancelling}
        onCancel={run.cancelRun}
        outcome={t`Each page shows up here — text, fonts and images — as it is extracted.`}
      />
    )
  }
  if (loading) return <StepLoading {...props} />
  if (!hasPages) {
    return (
      <StepEmpty
        {...props}
        prerequisites={[
          {
            key: "pdf",
            met: (pdf.data?.pageCount ?? 0) > 0,
            label: t`Source PDF uploaded — ${pdf.data?.pageCount ?? 0} pages`,
          },
        ]}
      />
    )
  }

  const sourcePages = pdf.data?.pageCount

  return (
    <StepShell
      {...props}
      chips={[
        t`${pages.length} pages`,
        warnCount > 0 ? t`${warnCount} recovered from images` : t`Text layer on every page`,
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
                  className="h-[52px] w-[38px]"
                />
              ),
            })),
          ]}
          activeKey={selectedPage?.pageId ?? ""}
          onSelect={(key) => (key ? openPage(key) : closeDetail())}
          footer={
            sourcePages != null && sourcePages !== pages.length ? (
              <Trans>Source PDF has {sourcePages} pages — {pages.length} extracted.</Trans>
            ) : (
              <Trans>Counts show how many images each page contributed.</Trans>
            )
          }
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
            accent={plugin.hex}
            prevPageId={prevPageId}
            nextPageId={nextPageId}
            onStep={stepPage}
            onClose={closeDetail}
          />
        ) : (
          <StepBody
            title={<Trans>Extraction</Trans>}
            meta={t`${pages.length} pages`}
            actions={
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
            }
          >
            <ExtractRunBanner run={extractRun} />

            {warnCount > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {t`${warnCount} of ${pages.length} pages had no extracted text`}
                  </p>
                  <p className="mt-0.5 leading-relaxed">
                    <Trans>
                      These pages have no embedded text layer, but the Sectioning step recovered
                      text from the page images — so this PDF looks scanned or image-based. The
                      pipeline can still work from the recovered text, but for better summaries,
                      metadata, and translations, try to obtain a text-based version of this PDF
                      (one with a real text layer) rather than a scanned copy.
                    </Trans>
                  </p>
                </div>
              </div>
            )}

            <ExtractSpreadReview label={label} pages={pages} accent={plugin.hex} />

            <ExtractPageGrid label={label} pages={pages} onOpen={openPage} />
          </StepBody>
        )}
      </FloatingSaveProvider>
    </StepShell>
  )
}
