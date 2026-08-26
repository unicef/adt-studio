import { Trans, useLingui } from "@lingui/react/macro"
import { RailCollapseButton } from "./SideRail"

export interface PagesRailEmptyProps {
  pageCount: number
  imageCount: number
  extracting?: boolean
}

function GhostLine({ width }: { width: string }) {
  return <span className="block h-1 rounded-full bg-border" style={{ width }} />
}

function GhostPage() {
  return (
    <span className="flex w-[52px] flex-col gap-1 rounded-[5px] border border-dashed bg-card p-2">
      <GhostLine width="100%" />
      <GhostLine width="76%" />
      <span className="block h-4 rounded-[3px] bg-muted" />
      <GhostLine width="88%" />
      <GhostLine width="60%" />
    </span>
  )
}

export function PagesRailEmpty({ pageCount, imageCount, extracting }: PagesRailEmptyProps) {
  const { t } = useLingui()

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Trans>Pages</Trans>
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground/60">0</span>
        <RailCollapseButton className="-mr-1" />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-2.5 px-3 pb-3">
        <div aria-hidden className="flex items-end justify-center gap-2">
          <GhostPage />
          <GhostPage />
          <GhostPage />
        </div>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          <Trans>
            No pages yet. The pages the reader sees show up in this list once the storyboard
            renders them.
          </Trans>
        </p>
      </div>

      <p className="mx-3 border-t py-2.5 text-[10px] leading-relaxed text-muted-foreground">
        {extracting
          ? t`Extracting the PDF: ${pageCount} pages so far`
          : t`PDF extracted: ${pageCount} pages · ${imageCount} images`}
      </p>
    </aside>
  )
}
