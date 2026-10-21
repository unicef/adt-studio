import { Parser } from "htmlparser2"
import type { ContentNodeData, PageSectioningOutput } from "@adt/types"

/** Replace image leaves and their placement keys without changing other authored content. */
export function replaceSectioningFigure(data: PageSectioningOutput, sourceId: string, imageId: string): PageSectioningOutput {
  function visit(nodes: ContentNodeData[]): ContentNodeData[] {
    return nodes.map((node) => ({ ...node,
      ...(node.role === "image" && node.nodeId === sourceId ? { nodeId: imageId } : {}),
      ...(node.children ? { children: visit(node.children) } : {}),
    }))
  }
  return { ...data, sections: data.sections.map((section) => {
    const placement = section.placement ? { ...section.placement } : undefined
    if (placement && Object.hasOwn(placement, sourceId)) {
      placement[imageId] = placement[sourceId]
      delete placement[sourceId]
    }
    return { ...section, nodes: visit(section.nodes), ...(placement ? { placement } : {}) }
  }) }
}

/** Patch only matching img tags, preserving surrounding HTML, scripts, and layout verbatim. */
export function replaceRenderedFigure(html: string, bookLabel: string, sourceId: string, imageId: string): string {
  const imagePath = `/books/${bookLabel}/images/${sourceId}`
  const replacement = `/api/books/${bookLabel}/images/${imageId}`
  const patches: Array<{ start: number; end: number; tag: string }> = []
  const parser = new Parser({ onopentag(name, attrs) {
    if (name !== "img") return
    const srcPath = (attrs.src ?? "").split(/[?#]/)[0]
    const localSrc = srcPath === `/api${imagePath}` || srcPath === imagePath
    if (attrs["data-id"] !== sourceId && !localSrc) return
    let hasId = false
    let hasSrc = false
    let hasStyle = false
    let tag = html.slice(parser.startIndex, parser.endIndex + 1).replace(
      /(\s+)([^\s"'<>/=]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
      (attribute, space: string, key: string, equals: string, double: string | undefined, single: string | undefined, bare: string | undefined) => {
        switch (key.toLowerCase()) {
          case "data-id": hasId = true; return `${space}${key}${equals}"${imageId}"`
          case "src": hasSrc = true; return `${space}${key}${equals}"${replacement}"`
          case "srcset": return "" // A stale responsive source would override the replacement.
          case "style": {
            hasStyle = true
            const css = (double ?? single ?? bare ?? "").replace(/(?:^|;)\s*object-fit\s*:[^;]*/gi, "")
            const quote = double !== undefined ? '"' : "'"
            return `${space}${key}${equals}${quote}${css};object-fit:contain!important${quote}`
          }
          default: return attribute
        }
      },
    )
    const additions = `${hasId ? "" : ` data-id="${imageId}"`}${hasSrc ? "" : ` src="${replacement}"`}${hasStyle ? "" : ' style="object-fit:contain!important"'}`
    tag = tag.replace(/\/?\s*>$/, (close) => additions + close)
    patches.push({ start: parser.startIndex, end: parser.endIndex + 1, tag })
  } })
  parser.end(html)
  for (const patch of patches.reverse()) html = html.slice(0, patch.start) + patch.tag + html.slice(patch.end)
  return html
}
