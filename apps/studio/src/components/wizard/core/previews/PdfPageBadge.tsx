import { Trans } from "@lingui/react/macro"

/**
 * Page badge for PDF previews. Leads with the physical page number (the
 * position the page range / split operates on) and shows the PDF's printed
 * page label (e.g. "iii", "A") only as a secondary tag when it differs — so the
 * two numbering schemes are never mistaken for each other.
 */
export function PdfPageBadge({
  pageNum,
  printedLabel,
}: {
  pageNum: number
  printedLabel: string
}) {
  const hasPrintedLabel = printedLabel !== String(pageNum)
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1.5">
      <span className="rounded-md border border-border/70 bg-background/90 px-2 py-1 text-[11px] font-semibold tabular-nums text-foreground shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-background/75">
        <Trans>Page {pageNum}</Trans>
      </span>
      {hasPrintedLabel && (
        <span className="rounded-md border border-border/60 bg-muted/80 px-1.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
          <Trans>labeled {printedLabel}</Trans>
        </span>
      )}
    </div>
  )
}
