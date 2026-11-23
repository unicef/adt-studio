import { useState } from "react"
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
 */
export function useExtractRerun(bookLabel: string) {
  const { extractRerun, extractRerunDiscards, queueRun } = useBookRun()
  const { apiKey } = useApiKey()
  const { data: pages } = usePages(bookLabel)
  const [confirming, setConfirming] = useState<{ attemptId: string | null; discards: ExtractRerunDiscards | null; follow: boolean } | null>(null)

  const action = extractRerunAction(extractRerun)
  const attemptId = extractRerun?.attemptId ?? null
  const blocked = (pages?.length ?? 0) > 0 && !action
  const blockedReason = blocked ? extractRerunBlockedMessage(extractRerun?.blockedReason) : undefined

  /** Start Extract, or ask before replacing. False when nothing can start.
   * `follow` opens the Extract view for the run: at once for a first
   * extraction, and for a re-run only after the server accepted it, so a
   * refusal leaves the user where they are. */
  const start = ({ follow = true }: { follow?: boolean } = {}): boolean => {
    if (blocked) return false
    if (action === "replace") {
      setConfirming({ attemptId, discards: extractRerunDiscards ?? null, follow })
    } else if (action) {
      queueRun({ fromStage: "extract", toStage: "extract", apiKey, extraction: { action, attemptId }, viewAfterStart: follow })
    } else {
      queueRun({ fromStage: "extract", toStage: "extract", apiKey, viewAfter: follow })
    }
    return true
  }

  const dialog = (
    <ExtractReplaceDialog
      open={confirming !== null}
      discards={confirming?.discards}
      onCancel={() => setConfirming(null)}
      onConfirm={() => {
        if (!confirming) return
        setConfirming(null)
        queueRun({
          fromStage: "extract", toStage: "extract", apiKey,
          extraction: { action: "replace", attemptId: confirming.attemptId }, viewAfterStart: confirming.follow,
        })
      }}
    />
  )

  return { action, blocked, blockedReason, start, dialog }
}
