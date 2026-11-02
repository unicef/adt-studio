import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"

/** HTTP codes and persisted/SSE code-prefixed errors use the same translations.
 * Provider diagnostics keep their existing presentation when no code matches. */
export function sectioningErrorMessage(error?: string, code?: string): string | undefined {
  const selected = code ?? error?.match(/\b(BOOK_BUSY|STORYBOARD_INPUT_CHANGED|STORYBOARD_PUBLICATION_INCOMPLETE|STORYBOARD_PAGE_INPUT_MISSING|SECTIONING_INPUT_UNREADABLE|SECTIONING_REGENERATION_BLOCKED|UNSAFE_RESUME_UNAVAILABLE|VERSION_CONFLICT|REPLACEMENT_CONFIRMATION_INVALID)\b/)?.[1]
  switch (selected) {
    case "BOOK_BUSY": return i18n._(msg`This book is being changed by another operation. Wait for it to finish, then retry.`)
    case "STORYBOARD_INPUT_CHANGED": return i18n._(msg`Storyboard inputs changed or the requested scope is incompatible with this layout. Refresh the saved content and render the affected pages again.`)
    case "STORYBOARD_PUBLICATION_INCOMPLETE": return i18n._(msg`Changing layout requires every active page to render successfully. Run the whole Storyboard stage. Previous output is retained.`)
    case "STORYBOARD_PAGE_INPUT_MISSING": {
      const pages = error?.match(/STORYBOARD_PAGE_INPUT_MISSING:\s*([^;]*)/)?.[1]?.trim() ?? ""
      const total = error?.match(/; total=(\d+)/)?.[1]
      if (total) return i18n._(msg`Some pages have missing or unreadable input (${total} total; showing up to 20): ${pages}. Other runnable pages remain available.`)
      return i18n._(msg`Some pages have missing or unreadable input: ${pages}. Other runnable pages remain available.`)
    }
    case "SECTIONING_INPUT_UNREADABLE": return i18n._(msg`This page's saved Sectioning is unreadable. Restore a valid historical version before replacing it. History and media are retained.`)
    case "SECTIONING_REGENERATION_BLOCKED":
    case "UNSAFE_RESUME_UNAVAILABLE": return i18n._(msg`Existing-book extraction and CLI resume are unavailable here. Use Sectioning in Studio to review and confirm any replacement.`)
    case "VERSION_CONFLICT": return i18n._(msg`The saved content changed. Your draft is retained. Refresh and review the current versions before retrying.`)
    case "REPLACEMENT_CONFIRMATION_INVALID": return i18n._(msg`Review the affected pages and their current versions, then explicitly confirm replacement and the Storyboard reset.`)
    default: return error
  }
}
