import { navigateToPage } from "@/features/navigation/lib/page-swap"

/**
 * The one way the comments feature moves the reader to another page — following someone, or
 * opening a comment on another page from the list.
 *
 * It goes through the reader's own page turn, so a followed reader's page swaps in place like any
 * other, and falls back to a full load exactly where page turns do.
 */
export function goToPage(href: string): void {
  navigateToPage(href)
}
