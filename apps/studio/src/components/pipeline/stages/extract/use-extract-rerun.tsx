import { useEffect, useRef, useState } from "react"
import type { ExtractRerunDiscards } from "@adt/types"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"
import { extractRerunAction, extractRerunBlockedMessage } from "@/lib/extract-rerun-messages"
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
 * The confirmation is bound to the extraction and counts shown when it opened;
 * a book that changed meanwhile is refused by the server and changes nothing.
 *
 * `save` is the pending settings a run should use. A replace saves them only
 * once it is confirmed, so cancelling leaves the book's saved settings as they
 * were; a failed save is shown in the dialog and sends nothing.
 */
export function useExtractRerun(bookLabel: string) {
  const { extractRerun, extractRerunDiscards, queueRun } = useBookRun()
  const { apiKey } = useApiKey()
  const { data: pages } = usePages(bookLabel)
  const [confirming, setConfirming] = useState<{ attemptId: string | null; discards: ExtractRerunDiscards | null; follow: boolean; save?: () => Promise<void> } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const action = extractRerunAction(extractRerun)
  const attemptId = extractRerun?.attemptId ?? null
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
      setConfirming({ attemptId, discards: extractRerunDiscards ?? null, follow, save })
      return true
    }
    const run = () => action
      ? queueRun({ fromStage: "extract", toStage: "extract", apiKey, extraction: { action, attemptId }, viewAfterStart: follow })
      : queueRun({ fromStage: "extract", toStage: "extract", apiKey, viewAfter: follow })
    if (save) void save().then(run, () => {})
    else run()
    return true
  }

  const confirm = async () => {
    if (!confirming || saving) return
    if (confirming.save) {
      setSaving(true)
      setSaveError(null)
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
      extraction: { action: "replace", attemptId: confirming.attemptId }, viewAfterStart: confirming.follow,
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

  return { action, blocked, blockedReason, start, dialog }
}
