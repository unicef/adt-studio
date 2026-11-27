import { createHash } from "node:crypto"
import type { ContentNodeData, DrawItemParagraph, ImageBounds, PublisherRegion, PublisherSource } from "@adt/types"

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
const activeTree = (node: ContentNodeData): ContentNodeData[] => node.isPruned ? [] : [node, ...(node.children ?? []).flatMap(activeTree)]
const union = (bounds: ImageBounds[]): ImageBounds | undefined => bounds.length ? {
  x: Math.min(...bounds.map((b) => b.x)), y: Math.min(...bounds.map((b) => b.y)),
  width: Math.max(...bounds.map((b) => b.x + b.width)) - Math.min(...bounds.map((b) => b.x)),
  height: Math.max(...bounds.map((b) => b.y + b.height)) - Math.min(...bounds.map((b) => b.y)),
} : undefined

function lineBounds(line: DrawItemParagraph): ImageBounds {
  // blockBounds often spans several columns or a whole page. Use it only for a
  // single line. Otherwise estimate line width from runs; vertical positions and
  // image rectangles are measured PDF coordinates, not estimates.
  const width = line.blockBounds && line.blockBounds.height <= line.lineHeight * 1.5
    ? line.blockBounds.width
    : line.segments.reduce((sum, run) => {
      const size = Number.parseFloat(run.style?.["font-size"] ?? "14") || 14
      return sum + [...run.text].reduce((w, char) => w + (/[ilI.,' !:;]/.test(char) ? 0.25 : /[MWmw]/.test(char) ? 0.8 : 0.5), 0) * size
    }, 0)
  return { x: line.left, y: line.top, width: Math.max(1, width), height: line.lineHeight }
}

/** Conservative suggestions. Unmatched/ambiguous content remains full width.
 * We never split semantic groups or change the content tree / reading order.
 */
export function inferPublisherRegions(nodes: ContentNodeData[], source: PublisherSource): PublisherRegion[] {
  const items = nodes.filter((n) => !n.isPruned).map((node) => {
    const tree = activeTree(node)
    return { node, tree, text: normalize(tree.map((n) => n.text ?? "").join(" ")), boxes: [] as ImageBounds[] }
  })
  for (const draw of source.positioned?.drawItems ?? []) {
    if (draw.kind === "image") {
      const owner = items.find((item) => item.tree.some((n) => n.role === "image" && n.nodeId === draw.imageId))
      owner?.boxes.push(draw.bounds)
    } else {
      const text = normalize(draw.text)
      const byId = items.find((item) => item.tree.some((n) => n.nodeId === draw.textId))
      const matches = items.filter((item) => text.length >= 8 && item.text.includes(text))
      // Repeated labels should not attach arbitrary geometry to a content group.
      const owner = byId ?? (matches.length === 1 ? matches[0] : undefined)
      owner?.boxes.push(lineBounds(draw))
    }
  }
  const measured = items.map((item) => ({ ...item, bounds: union(item.boxes), heading: item.node.structure === "heading" || (!item.node.children && (!!item.node.headingLevel || /heading|title/.test(item.node.role ?? ""))), folio: item.node.role === "page_number" }))
  const region = (members: typeof measured, template: PublisherRegion["template"], columns: number[], origin: PublisherRegion["origin"]): PublisherRegion => {
    const slots: PublisherRegion["slots"] = []
    members.forEach((item, index) => {
      const column = columns[index]
      if (slots.at(-1)?.column === column) slots.at(-1)!.nodeIds.push(item.node.nodeId)
      else slots.push({ column, nodeIds: [item.node.nodeId] })
    })
    const key = members.map((m) => m.node.nodeId).join("|")
    return { id: `pub-region-${createHash("sha256").update(key).digest("hex").slice(0, 10)}`, template, origin, slots }
  }
  const links = measured.map(() => new Set<number>())
  const pageWidth = source.positioned?.pageWidth ?? 600
  for (let i = 0; i < measured.length; i++) {
    const a = measured[i]
    if (!a.bounds || a.heading || a.folio) continue
    for (let j = i + 1; j < measured.length; j++) {
      const b = measured[j]
      if (!b.bounds || b.heading || b.folio) continue
      const [left, right] = a.bounds.x < b.bounds.x ? [a.bounds, b.bounds] : [b.bounds, a.bounds]
      const overlap = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)
      if (right.x - left.x > pageWidth * 0.16 && left.x + left.width <= right.x + pageWidth * 0.025 && overlap > Math.min(left.height, right.height) * 0.15) {
        links[i].add(j); links[j].add(i)
      }
    }
  }
  const regions: PublisherRegion[] = []
  let index = 0
  while (index < measured.length) {
    const group = new Set([index])
    for (const member of group) for (const next of links[member]) group.add(next)
    const indices = [...group].sort((a, b) => a - b)
    const members = indices.map((i) => measured[i])
    // A connected band must also be contiguous in semantic reading order.
    if (indices.length > 1 && indices[0] === index && indices.at(-1)! - index + 1 === indices.length) {
      const columnBounds: ImageBounds[] = []
      const spatial = [...members].sort((a, b) => a.bounds!.x - b.bounds!.x)
      for (const item of spatial) {
        const bound = item.bounds!
        const prior = columnBounds.at(-1)
        if (prior && bound.x < prior.x + prior.width * 0.65) columnBounds[columnBounds.length - 1] = union([prior, bound])!
        else columnBounds.push(bound)
      }
      const columns = members.map((item) => columnBounds.reduce((best, b, i) => Math.abs(b.x - item.bounds!.x) < Math.abs(columnBounds[best].x - item.bounds!.x) ? i : best, 0))
      const runs = columns.filter((c, i) => i === 0 || c !== columns[i - 1])
      if (columnBounds.length >= 2 && columnBounds.length <= 3 && runs.length === columnBounds.length && new Set(runs).size === runs.length) {
        const ratio = columnBounds[0].width / Math.max(1, columnBounds[1].width)
        const template = columnBounds.length === 3 ? "three-column" : ratio < 0.65 ? "sidebar-left" : ratio > 1.55 ? "sidebar-right" : "two-column"
        regions.push(region(members, template, columns, "pdf"))
        index += members.length
        continue
      }
    }
    // Semantic fallback when PDF geometry is absent: a sidebar and adjacent
    // paragraph form a two-slot band. Do not guess placement for measured pages.
    const next = measured[index + 1]
    if (!source.positioned && next && [measured[index].node.structure, next.node.structure].includes("sidebar") && [measured[index].node.structure, next.node.structure].includes("paragraph")) {
      const sidebarFirst = measured[index].node.structure === "sidebar"
      regions.push(region([measured[index], next], "sidebar-right", sidebarFirst ? [1, 0] : [0, 1], "semantic"))
      index += 2
      continue
    }
    const first = measured[index]
    const full = [first]
    // Keep headers, figures and folios distinct in the publisher's region map.
    while (index + full.length < measured.length) {
      const candidate = measured[index + full.length]
      if (links[index + full.length].size || candidate.node.structure !== first.node.structure || candidate.folio !== first.folio || first.tree.some((n) => n.role === "image")) break
      full.push(candidate)
    }
    regions.push(region(full, "full-width", full.map(() => 0), full.every((m) => m.bounds) ? "pdf" : "semantic"))
    index += full.length
  }
  return regions
}
