import { useRef } from "react"
import { RotateCcw } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { ExtractRerunDiscards } from "@adt/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { STAGES } from "@/components/pipeline/stage-config"
import { cn } from "@/lib/utils"

/**
 * Confirmation before a complete extraction is replaced (SPEC-0003 RAC-23).
 * States what is discarded, with the counts step-status reported when the
 * dialog opened, and what is kept. Cancel has the initial focus and Escape
 * closes without sending anything; only the destructive button confirms.
 * `busy` covers the settings save a confirmation may start: nothing can be
 * pressed or closed meanwhile. `error` is why that save failed.
 */
export function ExtractReplaceDialog({
  open,
  discards,
  onCancel,
  onConfirm,
  busy = false,
  error,
}: {
  open: boolean
  /** Null when the counts are not available; the dialog then names no numbers. */
  discards: ExtractRerunDiscards | null | undefined
  onCancel: () => void
  onConfirm: () => void
  busy?: boolean
  error?: string | null
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const stage = STAGES.find((s) => s.slug === "extract")

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader className="flex-row items-start gap-3.5 space-y-0 text-left">
          {stage && (
            <span
              className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm", stage.color)}
              aria-hidden
            >
              <stage.icon className="h-5 w-5 text-white" strokeWidth={2} />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1 pt-0.5">
            <DialogTitle className="text-[16px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
              <Trans>Extract this book again?</Trans>
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-snug text-[#525252]">
              <Trans>
                The extracted pages, their images and the edits made in Extract
                will be discarded. The PDF is then extracted again with the
                current settings.
              </Trans>
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2 text-[13px] text-[#0a0a0a]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#a3a3a3]">
            <Trans>Will be discarded</Trans>
          </p>
          {discards && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5">
              <dt><Trans>Extracted pages</Trans></dt>
              <dd className="text-right font-medium tabular-nums">{discards.pages}</dd>
              <dt><Trans>Images taken from the PDF</Trans></dt>
              <dd className="text-right font-medium tabular-nums">{discards.extractedImages}</dd>
              <dt><Trans>Images added in Extract (crops, segments and uploads)</Trans></dt>
              <dd className="text-right font-medium tabular-nums">{discards.addedImages}</dd>
            </dl>
          )}
          <p className="leading-snug text-[#525252]">
            <Trans>
              Edits made in Extract are lost: image decisions, crops, segments,
              added images and book details.
            </Trans>
          </p>
          <p className="leading-snug text-[#525252]">
            <Trans>The PDF, settings, fonts and prompts are kept.</Trans>
          </p>
          {error && <p role="alert" className="leading-snug text-red-700">{error}</p>}
        </div>

        <div className="-mx-6 border-t border-[#f1f1f1]" aria-hidden />
        <DialogFooter className="-mt-1 gap-2">
          <Button
            ref={cancelRef}
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
            className="h-10 px-4 font-medium text-[#525252] hover:text-[#0a0a0a]"
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            disabled={busy}
            onClick={onConfirm}
            className="h-10 px-5 font-medium text-white border-0 shadow-sm bg-red-600 hover:bg-red-700"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            <Trans>Discard and extract again</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
