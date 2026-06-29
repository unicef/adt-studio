import { Scissors, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { type SplitStatus } from "../../api/client"
import { cn } from "../../lib/utils"
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog"
import { ExportPartControls, type ExportPartState } from "./ExportPartControls"
import { SplitPagePreview } from "./SplitPagePreview"
import { CoverageBar } from "./CoverageBar"

/**
 * Full-screen split view: the export controls on the left and a live PDF page
 * preview on the right that highlights the selected range. Shares its
 * {@link ExportPartState} with the inline panel so edits stay in sync.
 */
export function SplitPreviewDialog({
  open,
  onOpenChange,
  bookLabel,
  pageCount,
  status,
  state,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookLabel: string
  pageCount: number
  status: SplitStatus | undefined
  state: ExportPartState
}) {
  const { t } = useLingui()
  const splitStarted =
    !!status && (status.exported.length > 0 || status.mergedRanges.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1400px] gap-0 overflow-hidden p-0 [&>button]:hidden">
        <aside className="flex w-full max-w-[420px] shrink-0 flex-col overflow-hidden border-r border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-6 py-4">
            <Scissors className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
            <DialogTitle className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Trans>Split into parts</Trans>
            </DialogTitle>
          </header>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            <ExportPartControls state={state} pageCount={pageCount} status={status} />
            {splitStarted && <CoverageBar status={status} />}
            <PreviewLegend className="mt-auto" />
          </div>
        </aside>

        <div className="relative min-w-0 flex-1 bg-[#fafafa] p-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t`Close`}
            className="absolute right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
          <SplitPagePreview
            bookLabel={bookLabel}
            startPage={state.startPage}
            endPage={state.endPage}
            plan={state.plan}
            exported={status?.exported}
            onSelectRange={
              state.mode === "custom"
                ? (s, e) => {
                    state.setStartPage(s)
                    state.setEndPage(e)
                    state.setTouched(true)
                  }
                : undefined
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Key to the preview's range highlight and per-page badges. */
function PreviewLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide">
        <Trans>Legend</Trans>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-4 w-4 shrink-0 rounded border-2 border-primary bg-primary/10" />
        <Trans>Pages in the selected range</Trans>
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-flex shrink-0 items-center rounded border border-part/40 bg-part/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-part">
          <Trans>Part</Trans>
        </span>
        <Trans>Start of an equal-split window</Trans>
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-flex shrink-0 items-center rounded border border-emerald-500/40 bg-emerald-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          <Trans>Exported</Trans>
        </span>
        <Trans>Already handed out</Trans>
      </span>
    </div>
  )
}
