import type { PageSummaryItem } from "@/api/client"

/** The page shape the staleness rules read — `PipelinePage` satisfies it. */
export interface StalenessPage extends PageSummaryItem {
  isDiscarded: boolean
}

/**
 * A page whose rendered HTML is behind the sections it was built from: the
 * Sectioning tree was saved after the render, so the packaged page would still
 * carry the old structure. Same rule the old Storyboard index used for its
 * "Out of date" badge — the render is cached output that a later step discarded.
 */
export function isPageOutdated(page: StalenessPage): boolean {
  return (
    !page.isDiscarded &&
    page.renderingVersion != null &&
    page.sectioningVersion != null &&
    page.sectioningVersion > page.renderingVersion
  )
}

/**
 * True when renderings exist yet Storyboard no longer reads done. Editing
 * sections clears the storyboard chain's step runs without deleting the HTML
 * (`markStoryboardChainStale` in apps/api/src/routes/pages.ts), so this is the
 * only signal that the pages on screen are behind their sections when no single
 * page carries a version bump.
 */
export function isStoryboardInvalidated(hasRendering: boolean, storyboardState: string): boolean {
  return hasRendering && storyboardState !== "done"
}
