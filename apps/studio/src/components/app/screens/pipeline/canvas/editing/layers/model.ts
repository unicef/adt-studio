import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import {
  Heading,
  Image as ImageIcon,
  Link2,
  List,
  MousePointerClick,
  PanelTop,
  Quote,
  RectangleVertical,
  Square,
  Type,
  type LucideIcon,
} from "lucide-react"

export interface LayerNode {
  key: string
  dataId: string | null
  tag: string
  preview: string
  children: LayerNode[]
}

const GROUP_TAGS = new Set(["div", "section", "article", "header", "footer", "figure", "ul", "ol", "main", "aside", "nav"])

export function describe(tag: string): { icon: LucideIcon; label: MessageDescriptor } {
  if (tag === "section-root") return { icon: PanelTop, label: msg`Section` }
  if (/^h[1-6]$/.test(tag)) return { icon: Heading, label: msg`Heading` }
  if (tag === "p") return { icon: Type, label: msg`Paragraph` }
  if (tag === "img" || tag === "picture" || tag === "svg") return { icon: ImageIcon, label: msg`Image` }
  if (tag === "ul" || tag === "ol") return { icon: List, label: msg`List` }
  if (tag === "li") return { icon: List, label: msg`List item` }
  if (tag === "a") return { icon: Link2, label: msg`Link` }
  if (tag === "button" || tag === "input" || tag === "label") return { icon: MousePointerClick, label: msg`Button` }
  if (tag === "blockquote" || tag === "figcaption") return { icon: Quote, label: msg`Caption` }
  if (GROUP_TAGS.has(tag)) return { icon: RectangleVertical, label: msg`Container` }
  return { icon: Square, label: msg`Element` }
}

export function buildTree(html: string, sectionIndex: number): LayerNode[] {
  const doc = new DOMParser().parseFromString(html, "text/html")
  let counter = 0
  const walk = (element: Element): LayerNode[] => {
    const nested = Array.from(element.children).flatMap(walk)
    const tag = element.tagName.toLowerCase()
    const dataId = element.getAttribute("data-id")
    if (dataId) {
      const text = tag === "img" ? element.getAttribute("alt") ?? "" : element.textContent ?? ""
      const leafText = GROUP_TAGS.has(tag) && nested.length === 0 && text.trim().length > 0
      return [{ key: dataId, dataId, tag: leafText ? "p" : tag, preview: text.replace(/\s+/g, " ").trim().slice(0, 40), children: nested }]
    }
    if (GROUP_TAGS.has(tag) && nested.length > 1) {
      counter += 1
      return [{ key: `group-${sectionIndex}-${counter}`, dataId: null, tag, preview: "", children: nested }]
    }
    return nested
  }
  return walk(doc.body)
}

export function containsId(node: LayerNode, dataId: string): boolean {
  return node.dataId === dataId || node.children.some((child) => containsId(child, dataId))
}

export function humanizeLayout(sectionType: string): string {
  const words = sectionType.replace(/[_-]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ""
}
