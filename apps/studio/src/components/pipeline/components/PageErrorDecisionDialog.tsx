import { useEffect, useState } from "react"
import { SkipForward, CircleStop } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react"
import { msg } from "@lingui/core/macro"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useBookRun } from "@/hooks/use-book-run"
import { getStepLabelI18n } from "../pipeline-i18n"

/**
 * Interactive prompt shown when a page fails inside a per-page step and the run
 * is waiting for the user to decide: skip that page and keep going, or stop the
 * whole step. Decisions queue — one is shown at a time. Mounted at the book
 * layout so it appears on any screen of the book.
 */
export function PageErrorDecisionDialog() {
  const { i18n } = useLingui()
  const { pendingDecisions, resolveDecision } = useBookRun()
  const current = pendingDecisions[0]
  const [applyToAll, setApplyToAll] = useState(false)

  // Reset the "apply to all" checkbox whenever a new decision comes to the head.
  useEffect(() => {
    setApplyToAll(false)
  }, [current?.decisionId])

  if (!current) return null

  const stepLabel = getStepLabelI18n(current.step)

  const resolve = (action: "skip" | "stop") => {
    resolveDecision(current.decisionId, action, applyToAll)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Dismissing without choosing is not allowed — the run is blocked on a
        // decision. Ignore close attempts; the buttons are the only exits.
        if (!open) return
      }}
    >
      <DialogContent className="gap-5 p-6 sm:max-w-md [&>button]:hidden">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[16px] font-semibold leading-tight tracking-tight">
            <Trans>A page failed in {stepLabel}</Trans>
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-snug text-muted-foreground">
            <Trans>
              Skip this page and continue the step, or stop the step entirely.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            <Trans>Page</Trans> {current.pageId}
          </p>
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs text-foreground/80">
            {current.error}
          </p>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-current"
          />
          <Trans>Apply to all errors in this run</Trans>
        </label>

        <DialogFooter className="-mt-1 gap-2">
          <Button
            variant="ghost"
            onClick={() => resolve("skip")}
            className="h-10 px-4 font-medium"
            title={i18n._(msg`Skip page and continue`)}
          >
            <SkipForward className="mr-2 h-4 w-4" />
            <Trans>Skip page and continue</Trans>
          </Button>
          <Button
            variant="destructive"
            onClick={() => resolve("stop")}
            className="h-10 px-5 font-medium"
            title={i18n._(msg`Stop step`)}
          >
            <CircleStop className="mr-2 h-4 w-4" />
            <Trans>Stop step</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
