import { PageSectioningOutput, WebRenderingOutput, PIPELINE, getStageDependents } from "@adt/types"
import { replaceRenderedFigure, replaceSectioningFigure } from "@adt/pipeline"
import type { Storage } from "@adt/storage"

/** Called inside the acceptance transaction; only changed current versions get successors. */
export function replaceCleanupInStoryboard(storage: Storage, bookLabel: string, sourceId: string, imageId: string): void {
  let changed = false
  for (const pageId of storage.getNodeItemIds("page-sectioning")) {
    const row = storage.getLatestNodeData("page-sectioning", pageId)
    if (!row || !PageSectioningOutput.safeParse(row.data).success) continue
    const data = row.data as PageSectioningOutput
    const next = replaceSectioningFigure(data, sourceId, imageId)
    if (JSON.stringify(next) === JSON.stringify(data)) continue
    storage.putNodeData("page-sectioning", pageId, next)
    changed = true
  }
  for (const pageId of storage.getNodeItemIds("web-rendering")) {
    const row = storage.getLatestNodeData("web-rendering", pageId)
    if (!row || !WebRenderingOutput.safeParse(row.data).success) continue
    const data = row.data as WebRenderingOutput
    const sections = data.sections.map((section) => ({ ...section,
      html: replaceRenderedFigure(section.html, bookLabel, sourceId, imageId),
    }))
    if (sections.every((section, index) => section.html === data.sections[index].html)) continue
    storage.putNodeData("web-rendering", pageId, { ...data, sections })
    changed = true
  }
  if (changed) {
    // Storyboard HTML and sectioning agree; retain all downstream entities and history.
    const dependents = new Set(getStageDependents("storyboard"))
    storage.clearStepRuns(PIPELINE.filter((stage) => dependents.has(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name)))
  }
}
