import { createContext, useContext } from "react"

/**
 * Which slide of the book the stage views have open.
 *
 * Lives here rather than in the route module so a component can read it
 * without importing a route — which would drag `createFileRoute` and the whole
 * router registration in behind it. The route builds the value and provides it.
 */
export interface SectionNavContext {
  sectionIndex: number
  setSectionIndex: (index: number | ((prev: number) => number)) => void
  /**
   * The open slide, by stable section id, held in the URL.
   *
   * A page can hold several sections, so `$pageId` alone does not say which
   * one is open — and the numeric index below cannot survive a reload or a
   * Back, nor an edit that renumbers the page. Views that know their sections
   * resolve this to an index themselves; the layout deliberately does not,
   * since that would mean fetching page detail on every stage.
   *
   * Null when the URL names no section, which means "the first one".
   */
  selectedSectionId: string | null
  /**
   * Open a slide. `pageId` moves to another page in the same step — or to a
   * quiz, which is routed under a synthetic page id of its own; omit it to stay
   * on the current page.
   *
   * Pushes a history entry by default, so Back steps through the slides the
   * user visited. Pass `replace` for a correction they did not ask for — an
   * initial selection, or a clamp after the page's sections changed.
   */
  selectSlide: (
    target: { pageId?: string; sectionId?: string | null },
    options?: { replace?: boolean },
  ) => void
}
export const SectionNavCtx = createContext<SectionNavContext>({
  sectionIndex: 0,
  setSectionIndex: () => {},
  selectedSectionId: null,
  selectSlide: () => {},
})
export function useSectionNav() { return useContext(SectionNavCtx) }
