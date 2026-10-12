import { useRef, useState } from "react"
import { SkipForward, CircleStop, RotateCcw } from "lucide-react"
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
import type { PendingDecision } from "@/api/client"
import { getLlmErrorClassLabel } from "@/lib/llm-error-class-i18n"
import { getStepLabelI18n } from "../pipeline-i18n"

/**
 * Interactive prompt shown when a page fails inside a per-page step and the run
 * is waiting for the user to decide: skip that page and keep going, or stop the
 * whole step. Decisions queue — one is shown at a time. Mounted at the book
 * layout so it appears on any screen of the book.
 */
export function PageErrorDecisionDialog() {
  const { pendingDecisions } = useBookRun()
  const current = pendingDecisions[0]
  // Polling may advance while a previous POST is still in flight. A keyed
  // component keeps that response from changing the next decision's state.
  return current ? <PendingPageErrorDecision key={current.decisionId} current={current} /> : null
}

function PendingPageErrorDecision({ current }: { current: PendingDecision }) {
  const { i18n } = useLingui()
  const { resolveDecision, refreshDecisions } = useBookRun()
  const [applyToAll, setApplyToAll] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submissionFailed, setSubmissionFailed] = useState(false)
  const busy = useRef(false)

  const stepLabel = getStepLabelI18n(current.step)

  const resolve = async (action: "retry" | "skip" | "stop") => {
    if (busy.current) return
    busy.current = true
    setSubmitting(true)
    setSubmissionFailed(false)
    try {
      await resolveDecision(current.decisionId, action, action === "retry" ? false : applyToAll)
    } catch {
      setSubmissionFailed(true)
    } finally {
      busy.current = false
      setSubmitting(false)
    }
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
      <DialogContent className="gap-5 p-6 sm:max-w-md [&>*]:min-w-0 [&>button]:hidden">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[16px] font-semibold leading-tight tracking-tight">
            <Trans>A page failed in {stepLabel}</Trans>
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-snug text-muted-foreground">
            {current.canRetry ? <Trans>Retry only this page with another bounded round of provider calls, skip it with an error, or stop the step.</Trans> : <Trans>Skip this page and continue the step, or stop the step entirely.</Trans>}
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

        {current.errorClass && (
          <p className="text-xs text-muted-foreground">
            {getLlmErrorClassLabel(i18n, current.errorClass)}
          </p>
        )}
        {current.attemptCount !== undefined && (
          <p className="text-xs text-muted-foreground">
            <Trans>Attempts made: {current.attemptCount}</Trans>
          </p>
        )}
        {submissionFailed && (
          <div role="alert" className="text-sm text-destructive">
            <Trans>The decision was not accepted. Refresh its status before trying again.</Trans>
            <Button
              variant="outline"
              onClick={() => {
                void refreshDecisions()
              }}
            >
              <Trans>Refresh status</Trans>
            </Button>
          </div>
        )}
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            disabled={submitting}
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-current"
          />
          <Trans>Apply to all errors in this run</Trans>
        </label>

        <DialogFooter className="-mt-1 flex-col gap-2 sm:flex-col [&>button]:w-full">
          {current.canRetry && <Button disabled={submitting || applyToAll} variant="outline" onClick={() => resolve("retry")}>
            <RotateCcw className="mr-2 h-4 w-4" /><Trans>Retry this page</Trans>
          </Button>}
          <Button
            disabled={submitting}
            variant="ghost"
            onClick={() => resolve("skip")}
            className="h-10 px-4 font-medium"
            title={i18n._(msg`Skip page and continue`)}
          >
            <SkipForward className="mr-2 h-4 w-4" />
            <Trans>Skip page and continue</Trans>
          </Button>
          <Button
            disabled={submitting}
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
