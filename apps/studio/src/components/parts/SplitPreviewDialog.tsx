import { Scissors } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { type SplitStatus } from "../../api/client"
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog"
import { ExportPartControls, type ExportPartState } from "./ExportPartControls"
import { SplitPagePreview } from "./SplitPagePreview"

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1400px] gap-0 overflow-hidden p-0">
        <aside className="flex w-full max-w-[420px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-6 py-4">
            <Scissors className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
            <DialogTitle className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Trans>Split into parts</Trans>
            </DialogTitle>
          </header>
          <div className="flex-1 p-6">
            <ExportPartControls state={state} pageCount={pageCount} status={status} />
          </div>
        </aside>
        <div className="min-w-0 flex-1 bg-[#fafafa] p-4">
          <SplitPagePreview
            bookLabel={bookLabel}
            startPage={state.startPage}
            endPage={state.endPage}
            plan={state.plan}
            exported={status?.exported}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
