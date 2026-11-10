import type { ContentNodeData } from "@adt/types"
import type { PageDetail } from "@/api/client"

export const ALL_SECTIONS = "all"

export function buildImageSectionMap(page: PageDetail | undefined): Map<string, number> {
  const map = new Map<string, number>()
  if (!page?.sectioningTree) return map
  const walk = (nodes: ContentNodeData[], sectionIndex: number) => {
    for (const node of nodes) {
      if (node.role === "image") map.set(node.nodeId, sectionIndex)
      else if (node.children) walk(node.children, sectionIndex)
    }
  }
  page.sectioningTree.sections.forEach((section, index) => walk(section.nodes, index))
  return map
}

export interface SectionTab {
  value: string
  sectionIndex: number
  sectionType?: string
  count: number
}

export function sectionTypeName(sectionType: string | undefined): string | null {
  const words = sectionType?.replace(/[_-]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null
}

export function sectionTabs(
  imageIds: readonly string[],
  sectionOf: ReadonlyMap<string, number>,
  sections: ReadonlyArray<{ sectionType?: string }>,
): SectionTab[] {
  if (sections.length <= 1) return []
  const counts = new Map<number, number>()
  for (const id of imageIds) {
    const index = sectionOf.get(id) ?? -1
    counts.set(index, (counts.get(index) ?? 0) + 1)
  }
  if (counts.size <= 1) return []
  return [...counts.entries()]
    .sort(([a], [b]) => (a < 0 ? 1 : b < 0 ? -1 : a - b))
    .map(([sectionIndex, count]) => ({ value: String(sectionIndex), sectionIndex, sectionType: sections[sectionIndex]?.sectionType, count }))
}
