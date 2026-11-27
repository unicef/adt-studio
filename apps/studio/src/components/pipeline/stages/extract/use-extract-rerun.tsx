import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useLingui } from "@lingui/react/macro"
import { ExtractionErrorCode, type ExtractRerunAction, type ExtractRerunDiscards, type ExtractRerunRequest } from "@adt/types"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"
import { extractRerunAction, extractRerunBlockedMessage } from "@/lib/extract-rerun-messages"
import { sectioningErrorMessage } from "@/lib/sectioning-error"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { ExtractReplaceDialog } from "./components/ExtractReplaceDialog"

/**
 * How Extract may run on this book from the Overview and the Settings bar
 * (SPEC-0003 RAC-21–24), from what step-status offers:
 *
 * - `replace`: a usable extraction. Asked for confirmation first.
 * - `retry` / `resume`: an extraction or an Extract step that did not finish.
 *   Sent directly: nothing usable is discarded.
 * - nothing offered and the book has pages: `blockedReason` says why, and
 *   nothing can be started.
 * - nothing offered and no pages: a first extraction, sent without the field.
 *
 * A retry or replace discards content, so its request names the content
 * step-status described (`contentToken`). The confirmation keeps the request
 * and the counts from when it opened: if the book changed meanwhile, in this
 * window or another, the server refuses the request and changes nothing.
 *
 * `save` is the pending settings a run should use. A replace saves them only
 * once it is confirmed, so cancelling leaves the book's saved settings as they
 * were; a failed save is shown in the dialog and sends nothing.
 *
 * A refused run must not change the saved settings either. So before pending
 * settings are saved for a re-run, `admit` reads the book's status from the
 * server and compares it with the request about to be sent: if the action is
 * no longer offered, or the extraction or content it is bound to changed,
 * nothing is saved and nothing is sent. The server still decides on the run
 * request itself; what is left is a change made in the moment between this
 * check and that request.
 */
export function useExtractRerun(bookLabel: string) {
  const { t } = useLingui()
  const { extractRerun, extractRerunDiscards, queueRun, refreshExtractRerun } = useBookRun()
  const { apiKey } = useApiKey()
  const { data: pages } = usePages(bookLabel)
  const [confirming, setConfirming] = useState<{ request: ExtractRerunRequest; discards: ExtractRerunDiscards | null; follow: boolean; save?: () => Promise<void> } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const action = extractRerunAction(extractRerun)
  /** The request for an offered action, bound to the book as step-status described it. */
  const requestFor = (offered: ExtractRerunAction): ExtractRerunRequest => ({
    action: offered,
    attemptId: extractRerun?.attemptId ?? null,
    ...(offered !== "resume" && extractRerun?.contentToken ? { contentToken: extractRerun.contentToken } : {}),
  })
  /** Would the server still accept `request`? Reads the status now. When it
   * would not, or the status cannot be read, says why as a refused run does
   * and answers false. */
  const stillOffered = async (request: ExtractRerunRequest): Promise<boolean> => {
    let detail = sectioningErrorMessage(undefined, ExtractionErrorCode.enum.EXTRACTION_RERUN_STALE)
    try {
      const fresh = await refreshExtractRerun()
      if (fresh?.actions.includes(request.action) && fresh.attemptId === request.attemptId
        && (request.action === "resume" || fresh.contentToken === request.contentToken)) return true
    } catch (cause) {
      detail = cause instanceof Error && cause.message ? cause.message : detail
    }
    toast.error(t`Could not start ${getStageLabelI18n("extract")}: ${detail}`, { id: `run-start:${bookLabel}:extract`, duration: 12_000 })
    return false
  }
  /** Ask before saving settings for the run `start` would send now. A first
   * extraction is bound to nothing, so there is nothing to ask. */
  const admit = async (): Promise<boolean> => !action || stillOffered(requestFor(action))
  const blocked = (pages?.length ?? 0) > 0 && !action
  const blockedReason = blocked ? extractRerunBlockedMessage(extractRerun?.blockedReason) : undefined

  /** Start Extract, or ask before replacing. False when nothing can start.
   * `follow` opens the Extract view for the run: at once for a first
   * extraction, and for a re-run only after the server accepted it, so a
   * refusal leaves the user where they are. */
  const start = ({ follow = true, save }: { follow?: boolean; save?: () => Promise<void> } = {}): boolean => {
    if (blocked) return false
    if (action === "replace") {
      setSaveError(null)
      setConfirming({ request: requestFor("replace"), discards: extractRerunDiscards ?? null, follow, save })
      return true
    }
    const run = () => action
      ? queueRun({ fromStage: "extract", toStage: "extract", apiKey, extraction: requestFor(action), viewAfterStart: follow })
      : queueRun({ fromStage: "extract", toStage: "extract", apiKey, viewAfter: follow })
    if (save) void admit().then((admitted) => admitted ? save().then(run, () => {}) : undefined)
    else run()
    return true
  }

  const confirm = async () => {
    if (!confirming || saving) return
    if (confirming.save) {
      setSaving(true)
      setSaveError(null)
      // The dialog described the book as it was when it opened. If the server
      // would now refuse the replace, the settings stay as they are saved.
      const admitted = await stillOffered(confirming.request)
      if (!mounted.current) return
      if (!admitted) { setSaving(false); setConfirming(null); return }
      try {
        await confirming.save()
      } catch (cause) {
        if (mounted.current) { setSaveError(cause instanceof Error ? cause.message : String(cause)); setSaving(false) }
        return
      }
      // The page may have been left while the settings were saving.
      if (!mounted.current) return
      setSaving(false)
    }
    setConfirming(null)
    queueRun({
      fromStage: "extract", toStage: "extract", apiKey,
      extraction: confirming.request, viewAfterStart: confirming.follow,
    })
  }

  const dialog = (
    <ExtractReplaceDialog
      open={confirming !== null}
      discards={confirming?.discards}
      busy={saving}
      error={saveError}
      onCancel={() => { if (!saving) setConfirming(null) }}
      onConfirm={() => { void confirm() }}
    />
  )

  return { action, blocked, blockedReason, start, admit, dialog }
}
