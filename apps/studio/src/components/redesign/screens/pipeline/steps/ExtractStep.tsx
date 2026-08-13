import { useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, EyeOff, FileText, Type, Undo2 } from "lucide-react"
import { api, BASE_URL, type PageDetail } from "@/api/client"
import { useSaveImageClassification } from "@/hooks/use-page-mutations"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { cn } from "@/lib/utils"
import { tint } from "@/components/redesign/screens/pipeline/shared/plugins"
import { useRunActivity, useStageActivity } from "@/components/redesign/screens/pipeline/runs/useRunActivity"
import { StepEmpty, StepLoading, StepRunning, StepShell } from "./shared/StepShell"
import { RowAction, SaveError, StepBody, StepCard, StepGroupLabel, StepRail } from "./shared/ui"
import type { StepProps } from "./shared/types"
import type { PipelinePage } from "@/components/redesign/screens/pipeline/shared/usePipelineState"

type ClassifiedImage = NonNullable<PageDetail["imageClassification"]>["images"][number]

function PageExtraction({
  label,
  page,
  detail,
  accent,
}: {
  label: string
  page: PipelinePage
  detail: PageDetail
  accent: string
}) {
  const { t } = useLingui()
  const save = useSaveImageClassification(label, page.pageId)
  const images = detail.imageClassification?.images ?? []

  const toggle = (imageId: string, isPruned: boolean) => {
    save.mutate({
      images: images.map((img) => (img.imageId === imageId ? { ...img, isPruned } : img)),
    })
  }

  const sizeOf = (image: ClassifiedImage) =>
    detail.imagesMeta.find((m) => m.imageId === image.imageId)

  return (
    <>
      <StepGroupLabel>{t`Page ${page.pageNumber}`}</StepGroupLabel>
      <SaveError error={save.error} />

      {detail.extractionWarning === "text-layer-missing" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <Trans>
              This page had no embedded text layer — the text below was recovered from the page image.
            </Trans>
          </span>
        </div>
      )}

      <StepCard accent={accent}>
        <div className="flex items-center gap-2">
          <FileText className="size-3 shrink-0" style={{ color: accent }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Trans>Extracted text</Trans>
          </span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {t`${page.wordCount} words`}
          </span>
        </div>
        {detail.text.trim() ? (
          <p className="max-h-52 overflow-auto whitespace-pre-wrap px-1.5 text-[12.5px] leading-relaxed">
            {detail.text}
          </p>
        ) : (
          <p className="px-1.5 text-[12.5px] italic text-muted-foreground">
            <Trans>No text on this page.</Trans>
          </p>
        )}

        {detail.fonts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
            <Type className="size-3 shrink-0 text-muted-foreground" />
            {detail.fonts.map((font) => (
              <span
                key={font.family}
                className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {font.family} · {font.sizes.join("/")}px
              </span>
            ))}
          </div>
        )}
      </StepCard>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {images.map((image) => {
            const meta = sizeOf(image)
            return (
              <StepCard key={image.imageId} muted={image.isPruned} accent={accent}>
                <img
                  src={`${BASE_URL}/books/${label}/images/${image.imageId}`}
                  alt=""
                  loading="lazy"
                  className="h-28 w-full rounded-lg border object-contain"
                />
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                    {image.imageId}
                  </span>
                  <RowAction
                    icon={image.isPruned ? Undo2 : EyeOff}
                    label={image.isPruned ? t`Keep this image` : t`Drop this image`}
                    onClick={() => toggle(image.imageId, !image.isPruned)}
                  />
                </div>
                {meta && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {meta.width}×{meta.height}
                  </span>
                )}
                {image.isPruned && image.reason && (
                  <p className="text-[11px] leading-snug text-muted-foreground">{image.reason}</p>
                )}
              </StepCard>
            )
          })}
        </div>
      )}
    </>
  )
}

export function ExtractStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const pdf = useSourcePdfInfo(label)
  const run = useRunActivity()
  const extract = useStageActivity("extract")

  const details = useQueries({
    queries: pages.map((page) => ({
      queryKey: ["books", label, "pages", page.pageId],
      queryFn: () => api.getPage(label, page.pageId),
    })),
  })

  const [activePageId, setActivePageId] = useState<string | null>(null)

  const entries = useMemo(
    () => pages.map((page, i) => ({ page, detail: details[i]?.data })),
    [pages, details],
  )

  if (extract.isActive && pages.length === 0) {
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
  if (pages.length === 0) {
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
  if (details.every((d) => d.isLoading)) return <StepLoading {...props} />

  const withWarnings = entries.filter((e) => e.detail?.extractionWarning).length
  const shown = activePageId ? entries.filter((e) => e.page.pageId === activePageId) : entries
  const sourcePages = pdf.data?.pageCount

  return (
    <StepShell
      {...props}
      chips={[
        ...(extract.isActive ? [extract.runningLabel] : []),
        t`${pages.length} pages`,
        withWarnings > 0 ? t`${withWarnings} recovered from images` : t`Text layer on every page`,
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
            })),
          ]}
          activeKey={activePageId ?? ""}
          onSelect={(key) => setActivePageId(key ? key : null)}
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
        {shown.map(
          (entry) =>
            entry.detail && (
              <PageExtraction
                key={entry.page.pageId}
                label={label}
                page={entry.page}
                detail={entry.detail}
                accent={plugin.hex}
              />
            ),
        )}
      </StepBody>
    </StepShell>
  )
}
