import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"

export interface PagesRailEmptyProps {
  pageCount: number
  imageCount: number
  extracting?: boolean
}

function GhostLine({ width, tone = "muted" }: { width: string; tone?: "muted" | "brand" }) {
  return (
    <span
      className={tone === "brand" ? "block h-1 rounded-full bg-brand-200" : "block h-1 rounded-full bg-border"}
      style={{ width }}
    />
  )
}

/** Left rail before any section exists — explains what will land in this list. */
export function PagesRailEmpty({ pageCount, imageCount, extracting }: PagesRailEmptyProps) {
  const { t } = useLingui()

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Trans>Sections</Trans>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground/60">0</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-2.5 px-3 pb-3">
        <div aria-hidden className="flex items-center gap-2">
          <span className="flex w-[58px] flex-col gap-1 rounded-[5px] border bg-card p-2 shadow-[0_4px_10px_-6px_rgba(0,0,0,0.25)]">
            <GhostLine width="100%" />
            <GhostLine width="76%" />
            <span className="block h-4 rounded-[3px] bg-muted" />
            <GhostLine width="88%" />
            <GhostLine width="60%" />
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-brand-200" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="flex flex-col gap-1 rounded-md border-[1.5px] border-dashed border-brand-200 bg-brand-50 p-1.5">
              <GhostLine width="70%" tone="brand" />
              <GhostLine width="92%" tone="brand" />
            </span>
            <span className="flex flex-col gap-1 rounded-md border-[1.5px] border-dashed p-1.5">
              <GhostLine width="56%" />
              <GhostLine width="80%" />
            </span>
          </span>
        </div>

        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          <Trans>
            No sections yet. Each PDF page becomes one or more sections — they show up in this list once
            generated.
          </Trans>
        </p>

        <p className="border-t pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
          {extracting
            ? t`Extracting the PDF: ${pageCount} pages so far`
            : t`PDF extracted: ${pageCount} pages · ${imageCount} images`}
        </p>
      </div>
    </aside>
  )
}
