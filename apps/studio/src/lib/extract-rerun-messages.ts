import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { ExtractRerunAction, ExtractRerunBlockedReason, ExtractRerunStatus } from "@adt/types"

/** What Run or Retry does on a book that already has an extraction (SPEC-0003
 * RAC-21–23): replace a usable extraction after confirmation, else retry a
 * failed one, else resume its unfinished steps. Null when nothing is offered. */
export function extractRerunAction(status: ExtractRerunStatus | undefined): ExtractRerunAction | null {
  return (["replace", "retry", "resume"] as const).find((action) => status?.actions.includes(action)) ?? null
}

/** Why Extract cannot run again on a book that has pages (RAC-24). The reasons
 * are the server's stable identifiers; an unknown or missing one gets the
 * generic text, so a newer server never produces an empty explanation. */
export function extractRerunBlockedMessage(reason: ExtractRerunBlockedReason | null | undefined): string {
  switch (reason) {
    case "downstream-output": return i18n._(msg`This book already has work from Sectioning or later stages, so Extract cannot run again on it. To extract again, create a new book from the PDF.`)
    case "part-book": return i18n._(msg`This book is a part of a larger book. Its extraction is complete and stays fixed so the parts can be merged.`)
    case "split-coordinator": return i18n._(msg`This book has been split into parts. Its extraction stays fixed so the parts can be merged back into it.`)
    case "not-pdf-source": return i18n._(msg`This book was not created from a PDF, so there is nothing to extract again.`)
    case "run-active": return i18n._(msg`Wait for the current run to finish before running Extract again.`)
    default: return i18n._(msg`Extract cannot run again on this book. To extract again, create a new book from the PDF.`)
  }
}
