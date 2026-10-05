import { Trans, useLingui } from "@lingui/react/macro"

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
    <div className="flex min-h-0 flex-1 flex-col">
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
    </div>
  )
}
