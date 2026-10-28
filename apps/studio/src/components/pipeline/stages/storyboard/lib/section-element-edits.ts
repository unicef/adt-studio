import type { ContentNodeData, PageSectioningOutput } from "@adt/types"
import { findNode } from "@adt/types"

export type SectioningData = PageSectioningOutput

export const TEXT_LIKE_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "span", "em", "strong", "i", "b", "u", "s",
  "code", "kbd", "samp", "sub", "sup",
  "blockquote", "figcaption", "small", "mark", "cite",
])

export function renderedImageSrc(label: string, imageId: string): string {
  return `/api/books/${label}/images/${imageId}`
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function withSectionNodes(sectioning: SectioningData, sectionIndex: number, nextNodes: ContentNodeData[]): SectioningData {
  return {
    ...sectioning,
    sections: sectioning.sections.map((s, i) => (i === sectionIndex ? { ...s, nodes: nextNodes } : s)),
  }
}

export function replaceNodeWithSiblings(nodes: ContentNodeData[], targetNodeId: string, siblings: ContentNodeData[]): ContentNodeData[] {
  let replaced = false
  const walk = (list: ContentNodeData[]): ContentNodeData[] => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].nodeId === targetNodeId) {
        replaced = true
        return [...list.slice(0, i), ...siblings, ...list.slice(i + 1)]
      }
      const children = list[i].children
      if (children) {
        const nextChildren = walk(children)
        if (nextChildren !== children) {
          return list.map((n, j) => (j === i ? { ...n, children: nextChildren } : n))
        }
      }
    }
    return list
  }
  const next = walk(nodes)
  return replaced ? next : nodes
}

export function swapImageInHtml(html: string, label: string, targetId: string, newImageId: string): string {
  const oldSrc = renderedImageSrc(label, targetId)
  const newSrc = renderedImageSrc(label, newImageId)
  return html
    .replace(new RegExp(`data-id="${escapeRegex(targetId)}"`, "g"), `data-id="${newImageId}"`)
    .replace(new RegExp(escapeRegex(oldSrc), "g"), newSrc)
}

export function segmentImageInHtml(
  html: string,
  label: string,
  imageId: string,
  segments: Array<{ imageId: string; width: number; height: number; label: string }>,
): string {
  const segImgs = segments
    .map(
      (seg) =>
        `<img data-id="${seg.imageId}" src="${renderedImageSrc(label, seg.imageId)}" width="${seg.width}" height="${seg.height}" alt="${seg.label}" class="w-full" />`,
    )
    .join("\n")
  return html.replace(new RegExp(`<img[^>]*data-id="${escapeRegex(imageId)}"[^>]*/?>`, "g"), segImgs)
}

export interface SelectedElementInfo {
  isImage: boolean
  isContainer: boolean
  tagName: string | undefined
  textType: string | undefined
  isPruned: boolean
  hasTreeNode: boolean
  imageSrc: string | undefined
}

export function selectedElementInfo(
  selected: { dataId: string; tagName?: string | null },
  nodes: ContentNodeData[] | null | undefined,
  imageSrcOf: (dataId: string) => string,
): SelectedElementInfo {
  const { dataId, tagName } = selected
  const tag = tagName?.toLowerCase()
  const leaf = nodes ? findNode(nodes, dataId) : null
  const isImage = tag === "img" || leaf?.role === "image" || (!leaf && !tag && dataId.includes("_im"))
  const isContainer = !isImage && (!tag || !TEXT_LIKE_TAGS.has(tag))
  return {
    isImage,
    isContainer,
    tagName: tag,
    textType: leaf && !isImage ? leaf.role : undefined,
    isPruned: leaf?.isPruned ?? false,
    hasTreeNode: leaf != null,
    imageSrc: isImage ? imageSrcOf(dataId) : undefined,
  }
}
