import type { PageSummaryItem } from "@/api/client"

export interface StalenessPage extends PageSummaryItem {
  isDiscarded: boolean
}

export function isPageOutdated(page: StalenessPage): boolean {
  return (
    !page.isDiscarded &&
    page.renderingVersion != null &&
    page.sectioningVersion != null &&
    page.sectioningVersion > page.renderingVersion
  )
}

export function isStoryboardInvalidated(hasRendering: boolean, storyboardState: string): boolean {
  return hasRendering && storyboardState !== "done"
}
