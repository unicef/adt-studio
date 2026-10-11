import type { PageDetail, SectionRendering } from "@/api/client"

/** Read the persisted root identity without executing or rewriting its HTML. */
export function renderedSectionId(section: SectionRendering | undefined): string | null {
  if (!section?.html) return null
  const doc = new DOMParser().parseFromString(section.html, "text/html")
  const roots = doc.querySelectorAll("section")
  return roots.length === 1 ? roots[0].getAttribute("data-section-id") : null
}

/** Presentation must follow the same stable correspondence as Save. Legacy or
 * duplicate identities are not permission to display/edit a recycled index. */
export function findRenderedSection(
  rendering: PageDetail["rendering"] | undefined,
  sectionId: string | undefined,
  fixedLayout = false,
) {
  if (fixedLayout) {
    // Fixed layout has a page-level positioned rendering, not a projection of
    // the semantic sections. Only the authoritative page mode permits this path.
    return rendering?.sections.length === 1 && rendering.sections[0].sectionType === "fixed-layout-page"
      ? rendering.sections[0] : undefined
  }
  if (!sectionId) return undefined
  const matches = rendering?.sections.filter((section) => renderedSectionId(section) === sectionId) ?? []
  return matches.length === 1 ? matches[0] : undefined
}

/** Merge a queued inspector edit into exactly one stable rendering. A queued
 * source position is deliberately not accepted: stored indexes can be stale. */
export function mergeQueuedRenderingEdit(
  rendering: NonNullable<PageDetail["rendering"]>,
  edit: { sectionId?: string; fixedLayout: boolean; html: string },
): NonNullable<PageDetail["rendering"]> | null {
  const target = findRenderedSection(rendering, edit.sectionId, edit.fixedLayout)
  if (!target) return null
  // Inspector edits do not authorize a change of identity in their HTML.
  if (renderedSectionId({ ...target, html: edit.html }) !== renderedSectionId(target)) return null
  if (target.html === edit.html) return rendering
  return { ...rendering, sections: rendering.sections.map((section) => section === target ? { ...section, html: edit.html } : section) }
}
