import { Trans } from "@lingui/react/macro"
import { PageThumb } from "./PageThumb"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export function BuildingPagePreview({
  label,
  page,
  mode,
}: {
  label: string
  page: PipelinePage
  mode: "building" | "sectioning"
}) {
  return (
    <div className="flex w-[520px] flex-col items-center gap-4 animate-in fade-in duration-500">
      <div className="relative aspect-[3/4] w-[300px] overflow-hidden rounded-xl border bg-card shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)]">
        <PageThumb
          label={label}
          pageId={page.pageId}
          sectionIndex={null}
          className="absolute inset-0 h-full w-full object-contain opacity-55 saturate-50"
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-brand-400/25 to-transparent motion-safe:animate-scan" />
        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground/85 px-3 py-1 text-[11.5px] font-medium text-background backdrop-blur">
          {mode === "building" ? <Trans>Building page {page.pageNumber}</Trans> : <Trans>Sectioning page {page.pageNumber}</Trans>}
        </span>
      </div>
      <p className="max-w-[40ch] text-center text-[12.5px] leading-relaxed text-muted-foreground">
        {mode === "building" ? (
          <Trans>This is your PDF page. Its accessible version replaces it here as soon as it is built.</Trans>
        ) : (
          <Trans>This is your PDF page. Its sections show up here as soon as sectioning reaches it.</Trans>
        )}
      </p>
    </div>
  )
}
