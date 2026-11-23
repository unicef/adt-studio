import type { ContentNodeData, PageSectioningSection } from "@adt/types"

/** Structural inclusion, independent of asset availability. A missing image is
 * still required content, whereas a pruned ancestor excludes its descendants. */
export function hasRenderableContent(section: PageSectioningSection): boolean {
  const included = (node: ContentNodeData): boolean => !node.isPruned &&
    (!!node.role || !!node.structure && !!node.children?.some(included))
  return !section.isPruned && section.nodes.some(included)
}
