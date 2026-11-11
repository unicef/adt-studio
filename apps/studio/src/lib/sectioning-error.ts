import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"

// Messages produced for HISTORY_REPAIR_REQUIRED, remembered so translated
// errors can still be recognized without re-running the i18n macros here.
const recoverableMessages = new Set<string>()
const trackingMissingMessages = new Set<string>()

/** Whether an error can be resolved from the book's History recovery settings.
 * Accepts the raw server error/code or the message translated below. Missing
 * tracking evidence needs a book backup, so it gets no recovery link. */
export function needsHistoryRecovery(error?: string | null, code?: string | null): boolean {
  if (error && (error.includes("history-evidence/book@0") || trackingMissingMessages.has(error))) return false
  return code === "HISTORY_REPAIR_REQUIRED" || /\bHISTORY_REPAIR_REQUIRED\b/.test(error ?? "") || (!!error && recoverableMessages.has(error))
}

/** HTTP codes and persisted/SSE code-prefixed errors use the same translations.
 * Provider diagnostics keep their existing presentation when no code matches. */
export function sectioningErrorMessage(error?: string, code?: string): string | undefined {
  const selected = code ?? error?.match(/\b(HISTORY_RECOVERY_BOOK_MISSING|HISTORY_RECOVERY_AUDIT_MISSING|HISTORY_RECOVERY_STALE|HISTORY_RECOVERY_UNVERIFIED|HISTORY_RECOVERY_REQUEST_CONFLICT|HISTORY_RECOVERY_NOT_NEEDED|HISTORY_RECOVERY_REQUEST_INVALID|HISTORY_REPAIR_REQUIRED|PACKAGE_RECOVERY_UNSAFE|STORYBOARD_REQUEST_INVALID|STORYBOARD_PAGE_OUTSIDE_WINDOW|PACKAGE_FILES_INCOMPLETE|PACKAGE_INPUTS_CHANGED|BOOK_CONFIG_INVALID|SECTIONING_WINDOW_INVALID|PIPELINE_PAGES_FAILED|BOOK_BUSY|STORYBOARD_INPUT_CHANGED|STORYBOARD_PUBLICATION_INCOMPLETE|STORYBOARD_PAGE_INPUT_MISSING|SECTIONING_INPUT_UNREADABLE|SECTIONING_REGENERATION_BLOCKED|UNSAFE_RESUME_UNAVAILABLE|VERSION_CONFLICT|REPLACEMENT_CONFIRMATION_INVALID|EXTRACTION_LEGACY|EXTRACTION_INCOMPLETE|EXTRACTION_SOURCE_CHANGED|EXTRACTION_INPUTS_CHANGED|EXTRACTION_ASSETS_INVALID|EXTRACTION_INPUT_INVALID)\b/)?.[1]
  switch (selected) {
    case "HISTORY_RECOVERY_BOOK_MISSING": return i18n._(msg`The book could not be found. Return to the Library and open it again.`)
    case "HISTORY_RECOVERY_AUDIT_MISSING": return i18n._(msg`This recovery record could not be found. Inspect the book history again.`)
    case "HISTORY_RECOVERY_STALE": return i18n._(msg`The book changed after inspection. Inspect its history again and review the affected versions before confirming recovery.`)
    case "HISTORY_RECOVERY_UNVERIFIED": return i18n._(msg`The original history could not be verified. Existing records and assets have been retained. Recovery requires trustworthy evidence for these exact versions.`)
    case "HISTORY_RECOVERY_REQUEST_CONFLICT": return i18n._(msg`This recovery request was already used with different details. Inspect the book again before making a new request.`)
    case "HISTORY_RECOVERY_NOT_NEEDED": return i18n._(msg`There is no readable history that needs a recovery checkpoint.`)
    case "HISTORY_RECOVERY_REQUEST_INVALID": return i18n._(msg`The recovery request is invalid. Inspect the book again and explicitly confirm the affected versions.`)
    case "HISTORY_REPAIR_REQUIRED": {
      const trackingMissing = error?.includes("history-evidence/book@0") ?? false
      const message = trackingMissing
        ? i18n._(msg`History tracking is incomplete. Existing content is retained, but edits and generation that need verified history are unavailable. Restore a verified book backup; recovery cannot reconstruct missing tracking evidence.`)
        : i18n._(msg`Saved book history is unreadable. Existing content has been retained. Verified history recovery is required before generating new content.`)
      ;(trackingMissing ? trackingMissingMessages : recoverableMessages).add(message)
      return message
    }
    case "STORYBOARD_REQUEST_INVALID": return i18n._(msg`The edit request is invalid. Refresh the saved content and try again.`)
    case "STORYBOARD_PAGE_OUTSIDE_WINDOW": {
      const pages = error?.match(/STORYBOARD_PAGE_OUTSIDE_WINDOW:\s*([^;]*)/)?.[1]?.trim() ?? ""
      const total = error?.match(/; total=(\d+)/)?.[1] ?? ""
      return i18n._(msg`The requested pages are outside the active page window (${total} total; showing up to 20): ${pages}. Select pages within the current window. Saved content is retained.`)
    }
    case "PACKAGE_RECOVERY_UNSAFE": return i18n._(msg`The package recovery folder is unrecognized. Existing files have been retained. Check the book folder before preparing another export.`)
    case "PACKAGE_FILES_INCOMPLETE": {
      // Accept only the bounded, portable diagnostic fields. Legacy messages
      // and malformed/untrusted details retain the generic translated fallback.
      try {
        const detail: unknown = JSON.parse(error?.match(/PACKAGE_FILES_INCOMPLETE:\s*(.*)/)?.[1] ?? "")
        const safe = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 240 &&
          !/[\\:\x00-\x1f\x7f]/.test(value) && !value.startsWith("/") && !value.split("/").some(part => !part || part === "." || part === "..")
        if (detail && typeof detail === "object" && "document" in detail && "member" in detail && safe(detail.document) && safe(detail.member)) {
          const { document, member } = detail
          return i18n._(msg`The package document ${document} requires a missing or invalid file: ${member}. Existing output is retained. Correct the saved content or restore the file, then prepare the export again.`)
        }
      } catch { /* use the translated fallback */ }
      return i18n._(msg`The package is missing required files. Prepare the export again before downloading it.`)
    }
    case "PACKAGE_INPUTS_CHANGED": return i18n._(msg`The book changed while preparing the package. Prepare the export again using the current book.`)
    case "BOOK_CONFIG_INVALID": return i18n._(msg`This book's configuration is invalid or unreadable. Check its config.yaml file, then open the book again.`)
    case "SECTIONING_WINDOW_INVALID": return i18n._(msg`This book's saved part window is invalid or unreadable. Restore a valid part manifest before running it. Saved content is retained.`)
    case "PIPELINE_PAGES_FAILED": {
      const pages = error?.match(/PIPELINE_PAGES_FAILED:\s*([^;]*)/)?.[1]?.trim() ?? ""
      const total = error?.match(/; total=(\d+)/)?.[1] ?? ""
      return i18n._(msg`Generation failed on ${total} page(s) (showing up to 20): ${pages}. Successful pages are retained. Inspect the page errors before retrying.`)
    }
    case "BOOK_BUSY": return i18n._(msg`This book is being changed by another operation. Wait for it to finish, then retry.`)
    case "STORYBOARD_INPUT_CHANGED": return i18n._(msg`Storyboard inputs changed or the requested scope is incompatible with this layout. Refresh the saved content and render the affected pages again.`)
    case "STORYBOARD_PUBLICATION_INCOMPLETE": return i18n._(msg`Changing layout requires every active page to render successfully. Run the whole Storyboard stage. Previous output is retained.`)
    case "STORYBOARD_PAGE_INPUT_MISSING": {
      const pages = error?.match(/STORYBOARD_PAGE_INPUT_MISSING:\s*([^;]*)/)?.[1]?.trim() ?? ""
      const total = error?.match(/; total=(\d+)/)?.[1]
      if (total) return i18n._(msg`Some pages have missing or unreadable input (${total} total; showing up to 20): ${pages}. Other runnable pages remain available.`)
      return i18n._(msg`Some pages have missing or unreadable input: ${pages}. Other runnable pages remain available.`)
    }
    case "SECTIONING_INPUT_UNREADABLE": {
      const pages = error?.match(/SECTIONING_INPUT_UNREADABLE:\s*([^;]*)/)?.[1]?.trim() ?? ""
      const total = error?.match(/; total=(\d+)/)?.[1]
      if (total) return i18n._(msg`Saved Sectioning is unreadable on ${total} page(s) (showing up to 20): ${pages}. Those records were retained. Restore valid historical versions before replacing them. Other successful pages remain available.`)
      return i18n._(msg`This page's saved Sectioning is unreadable. Restore a valid historical version before replacing it. History and media are retained.`)
    }
    case "EXTRACTION_LEGACY": return i18n._(msg`This book has no verified extraction record. Saved content is retained. Start extraction in a new book.`)
    case "EXTRACTION_INCOMPLETE": return i18n._(msg`Extraction did not finish. Partial data is retained. Start extraction in a new book.`)
    case "EXTRACTION_SOURCE_CHANGED": return i18n._(msg`The source PDF has changed. Existing content is retained. Import the changed PDF as a new book.`)
    case "EXTRACTION_INPUTS_CHANGED": return i18n._(msg`Extraction settings have changed. Existing content is retained. Start extraction in a new book.`)
    case "EXTRACTION_ASSETS_INVALID": return i18n._(msg`Original extraction data is missing or unreadable. Existing data is retained. Restore a verified book copy or import the PDF as a new book.`)
    case "EXTRACTION_INPUT_INVALID": return i18n._(msg`The PDF or extraction settings are invalid. Check the file and settings before trying again.`)
    case "SECTIONING_REGENERATION_BLOCKED":
    case "UNSAFE_RESUME_UNAVAILABLE": return i18n._(msg`Existing-book extraction and CLI resume are unavailable here. Use Sectioning in Studio to review and confirm any replacement.`)
    case "VERSION_CONFLICT": return i18n._(msg`The saved content changed. Your draft is retained. Refresh and review the current versions before retrying.`)
    case "REPLACEMENT_CONFIRMATION_INVALID": return i18n._(msg`Review the affected pages and their current versions, then explicitly confirm replacement and the Storyboard reset.`)
    default: return error
  }
}
