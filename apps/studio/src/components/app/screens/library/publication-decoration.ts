import { publicationStateAt, type PublicationSummary } from "@adt/types"
import type { BookVM } from "../../data"
import type { BookPublication } from "./BookDetailDialog"

export interface PublicationDecoration {
  publication?: BookPublication | null
  pendingComments?: number
}

/**
 * Dresses a library book with what the account knows about its shared copy: the link and its
 * state for the detail dialog, and the open-comment count for the card. Nothing is added when
 * the book was never shared, so an author who has not connected Cloudflare sees the same cards
 * as before — the decoration is the difference, not a requirement.
 */
export function withPublication<T extends BookVM>(
  vm: T,
  byLabel: ReadonlyMap<string, PublicationSummary>,
  countsKnown: boolean,
): T & PublicationDecoration {
  const summary = byLabel.get(vm.label)
  if (!summary?.url) return vm
  return {
    ...vm,
    publication: {
      url: summary.url,
      accessCode: summary.access_code,
      state: publicationStateAt(summary),
    },
    ...(countsKnown ? { pendingComments: summary.unresolved_count } : {}),
  }
}
