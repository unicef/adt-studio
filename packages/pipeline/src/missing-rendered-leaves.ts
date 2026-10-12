import { parseDocument, DomUtils } from "htmlparser2"
import type { ContentNodeData, PageSectioningSection } from "@adt/types"
import { collectOptionalTextIds } from "./render-llm.js"

export interface MissingRenderedLeaf {
  sectionIndex: number
  nodeId: string
  text: string
}

export interface MissingRenderedLeavesOptions {
  /**
   * The book's `pruned_role_types`: roles hidden automatically at sectioning.
   * A visible leaf with one of these roles was un-hidden by the user, so it is
   * reported even when the renderer's validator would let the LLM drop it.
   */
  prunedRoleTypes?: readonly string[]
}

/**
 * Text leaves the sectioning tree shows as visible but whose `data-id` is
 * absent from the section's stored HTML, i.e. content the user expects on the
 * page that the render silently left out (#596). Read-only diagnostic: it
 * explains a gap, it doesn't repair one.
 *
 * Takes the *semantic* tree and an LLM/template rendering. Fixed-layout pages
 * render from a separate positioned tree with different ids, so callers must
 * not pass those (see render-sectioning.ts).
 *
 * Mirrors what the renderer itself requires:
 * - pruned sections, pruned nodes and everything under a pruned container
 *   are skipped;
 * - image leaves are skipped (dropped by design when their bytes are missing);
 * - leaves the validator lets the LLM drop (`collectOptionalTextIds`) are
 *   skipped, unless their role is one the book hides automatically;
 * - a rendered section whose type or section id no longer matches the tree's
 *   section is skipped: the rendering is stale and an index match is a guess.
 *
 * Presence is all that is checked: an `sr-only` element (text already legible
 * in an image) counts as rendered.
 */
export function findMissingRenderedLeaves(
  sectioning: { sections: PageSectioningSection[] } | null | undefined,
  rendering:
    | { sections: Array<{ sectionIndex: number; sectionType: string; html: string }> }
    | null
    | undefined,
  options: MissingRenderedLeavesOptions = {}
): MissingRenderedLeaf[] {
  if (!sectioning?.sections?.length || !rendering?.sections?.length) return []
  const autoPruned = new Set(options.prunedRoleTypes ?? [])

  const missing: MissingRenderedLeaf[] = []
  for (const rendered of rendering.sections) {
    const section = sectioning.sections[rendered.sectionIndex]
    if (!section || section.isPruned) continue
    if (rendered.sectionType !== section.sectionType) continue

    const doc = parseDocument(rendered.html)
    const sectionEl = DomUtils.findOne((el) => el.name === "section", doc.children)
    const renderedSectionId = sectionEl?.attribs["data-section-id"]
    if (renderedSectionId && renderedSectionId !== section.sectionId) continue

    const renderedIds = new Set(
      DomUtils.findAll((el) => el.attribs["data-id"] != null, doc.children).map(
        (el) => el.attribs["data-id"]
      )
    )

    const visibleTextLeaves: ContentNodeData[] = []
    const walk = (nodes: ContentNodeData[]) => {
      for (const node of nodes) {
        if (node.isPruned) continue
        if (node.children) walk(node.children)
        if (!node.role || node.role === "image") continue
        if (!(node.text ?? "").trim()) continue
        visibleTextLeaves.push(node)
      }
    }
    walk(section.nodes)

    const optional = collectOptionalTextIds(
      visibleTextLeaves.map((n) => ({ text_id: n.nodeId, text_type: n.role ?? "", text: n.text ?? "" }))
    )
    for (const node of visibleTextLeaves) {
      if (renderedIds.has(node.nodeId)) continue
      if (optional.has(node.nodeId) && !autoPruned.has(node.role ?? "")) continue
      missing.push({
        sectionIndex: rendered.sectionIndex,
        nodeId: node.nodeId,
        text: (node.text ?? "").trim(),
      })
    }
  }
  return missing
}
