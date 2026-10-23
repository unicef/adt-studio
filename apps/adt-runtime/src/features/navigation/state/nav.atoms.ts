/**
 * Navigation atoms — back the page list and TOC, both fetched once on boot.
 *
 * `currentSectionId` is derived from the DOM rather than mutated as the user
 * navigates, because each page is its own HTML file. Over `file://` a page turn
 * is a full document reload; over HTTP the document survives and the content is
 * swapped in place (see `features/navigation/lib/page-swap.ts`), so anything
 * holding references into `#content` must re-derive them — see `pageEpochAtom`.
 */
import { ephemeralAtom } from "@/shared/state/persist"

export interface PageEntry {
  section_id: string
  href: string
  page_number?: number
}

export interface TocEntry {
  section_id: string
  href: string
  title: string
  chapter_id: string
  level?: number
}

export const pagesAtom = ephemeralAtom<PageEntry[]>([])
export const tocAtom = ephemeralAtom<TocEntry[]>([])

/**
 * The current section id from the page's `<meta name="title-id">`. Stable
 * for the lifetime of one page load.
 */
export const currentSectionIdAtom = ephemeralAtom<string | null>(null)
export const currentPageNumberAtom = ephemeralAtom<number | null>(null)

/**
 * Incremented by `initializePageContent()` every time the runtime binds to a
 * page — once on boot, and again after each in-place swap.
 *
 * This is the invalidation signal for anything that caches nodes out of
 * `#content`. A swap replaces `<main>`, so cached `HTMLElement` references
 * point at a detached tree that is no longer on screen; deriving from atoms
 * that only change on language/settings changes is not enough. Depend on this
 * atom to rebuild.
 */
export const pageEpochAtom = ephemeralAtom(0)
