import { parseDocument } from "htmlparser2"
import type { RenderNode } from "./web-rendering.js"

interface HtmlNode {
  type?: string
  name?: string
  attribs?: Record<string, string>
  parent?: HtmlNode | null
  children?: HtmlNode[]
}

interface LabeledDiagram {
  imageId: string
  labelIds: string[]
  captionIds: string[]
}

function collectLabeledDiagrams(nodes: RenderNode[]): LabeledDiagram[] {
  const diagrams: LabeledDiagram[] = []

  function visit(node: RenderNode): void {
    if (node.structure === "image_group") {
      const leaves: RenderNode[] = []
      const collectLeaves = (candidate: RenderNode): void => {
        if (candidate.role) leaves.push(candidate)
        for (const child of candidate.children ?? []) collectLeaves(child)
      }
      collectLeaves(node)

      const image = leaves.find((leaf) => leaf.role === "image" && leaf.image_id)
      const labels = leaves.filter((leaf) => leaf.role === "label")
      if (image?.image_id && labels.length >= 2) {
        diagrams.push({
          imageId: image.image_id,
          labelIds: labels.map((label) => label.node_id),
          captionIds: leaves
            .filter((leaf) => leaf.role === "caption")
            .map((caption) => caption.node_id),
        })
      }
    }
    for (const child of node.children ?? []) visit(child)
  }

  for (const node of nodes) visit(node)
  return diagrams
}

function walk(node: HtmlNode, callback: (node: HtmlNode) => void): void {
  callback(node)
  for (const child of node.children ?? []) walk(child, callback)
}

function findByDataId(root: HtmlNode, id: string): HtmlNode | undefined {
  let match: HtmlNode | undefined
  walk(root, (node) => {
    if (!match && node.attribs?.["data-id"] === id) match = node
  })
  return match
}

function closest(node: HtmlNode | undefined, name: string): HtmlNode | undefined {
  let current = node
  while (current) {
    if (current.name === name) return current
    current = current.parent ?? undefined
  }
  return undefined
}

function descendants(root: HtmlNode, predicate: (node: HtmlNode) => boolean): HtmlNode[] {
  const matches: HtmlNode[] = []
  walk(root, (node) => {
    if (predicate(node)) matches.push(node)
  })
  return matches
}

function isHidden(node: HtmlNode): boolean {
  let current: HtmlNode | undefined = node
  while (current) {
    const classes = current.attribs?.class?.split(/\s+/) ?? []
    const style = current.attribs?.style?.replace(/\s+/g, "").toLowerCase() ?? ""
    if (
      classes.includes("sr-only") ||
      classes.includes("hidden") ||
      current.attribs?.hidden !== undefined ||
      current.attribs?.["aria-hidden"] === "true" ||
      style.includes("display:none") ||
      style.includes("visibility:hidden")
    ) {
      return true
    }
    current = current.parent ?? undefined
  }
  return false
}

function endpointCoordinates(node: HtmlNode): { start: [number, number]; end: [number, number] } | undefined {
  if (node.name === "line") {
    const values = ["x1", "y1", "x2", "y2"].map((name) => Number(node.attribs?.[name]))
    if (values.every(Number.isFinite)) return { start: [values[0], values[1]], end: [values[2], values[3]] }
  }
  if (node.name === "polyline") {
    const values = (node.attribs?.points ?? "").trim().split(/[\s,]+/).map(Number)
    if (values.length >= 4 && values.length % 2 === 0 && values.every(Number.isFinite)) {
      return { start: [values[0], values[1]], end: [values.at(-2)!, values.at(-1)!] }
    }
  }
  return undefined
}

function pointMatchesMarker(point: [number, number], marker: HtmlNode): boolean {
  const x = Number(marker.attribs?.cx)
  const y = Number(marker.attribs?.cy)
  return Number.isFinite(x) && Number.isFinite(y) && point[0] === x && point[1] === y
}

function hasLabelBackground(node: HtmlNode | undefined): boolean {
  const classes = node?.attribs?.class?.split(/\s+/) ?? []
  const style = node?.attribs?.style ?? ""
  return classes.some((name) => /^bg-(?!transparent(?:$|\/))/.test(name)) || /background(?:-color)?\s*:/i.test(style)
}

/** Structural guard for diagrams whose labels are separate from the image crop. */
export function validateLabeledDiagrams(html: string, nodes: RenderNode[]): string[] {
  const diagrams = collectLabeledDiagrams(nodes)
  if (diagrams.length === 0) return []

  const root = parseDocument(html) as unknown as HtmlNode
  const errors: string[] = []

  for (const diagram of diagrams) {
    const image = findByDataId(root, diagram.imageId)
    const figure = closest(image, "figure")
    if (!image || image.name !== "img") continue // Base HTML validation reports this.
    if (!figure) {
      errors.push(`Labeled diagram image "${diagram.imageId}" must be inside a semantic <figure>.`)
    }
    if (!image.attribs?.alt?.trim()) {
      errors.push(`Labeled diagram image "${diagram.imageId}" must have non-empty alt text.`)
    }

    for (const labelId of diagram.labelIds) {
      const label = findByDataId(root, labelId)
      if (!label) continue // Base HTML validation reports this.
      if (isHidden(label)) {
        errors.push(
          `Diagram label "${labelId}" must be visibly rendered; do not place extracted labels in sr-only or hidden content.`,
        )
      }
      if (figure && closest(label, "figure") !== figure) {
        errors.push(`Diagram label "${labelId}" must be associated with its image inside the same <figure>.`)
      }
    }

    for (const captionId of diagram.captionIds) {
      const caption = findByDataId(root, captionId)
      if (caption && caption.name !== "figcaption" && !closest(caption, "figcaption")) {
        errors.push(`Diagram caption "${captionId}" must use a semantic <figcaption>.`)
      }
    }

    if (figure) {
      const leaderPrimitives = descendants(
        figure,
        (node) => ["line", "polyline", "path"].includes(node.name ?? "") && Boolean(closest(node, "svg")),
      )
      const htmlLineDecorations = descendants(figure, (node) => {
        if (closest(node, "svg")) return false
        const classes = node.attribs?.class?.split(/\s+/) ?? []
        return classes.includes("h-px") || classes.some((name) => /^border-[bt]$/.test(name))
      })

      if (htmlLineDecorations.length > 0) {
        errors.push(
          "Labeled diagram callouts must not use disconnected HTML rules; use one SVG leader ending at a named feature marker.",
        )
      }

      if (leaderPrimitives.length > 0) {
        for (const labelId of diagram.labelIds) {
          const label = findByDataId(root, labelId)
          const link = closest(label, "a")
          const linkId = link?.attribs?.id ?? ""
          const href = link?.attribs?.href ?? ""
          const targetId = href.startsWith("#") ? href.slice(1) : ""
          const target = targetId
            ? descendants(figure, (node) => node.attribs?.id === targetId)[0]
            : undefined
          if (
            !target ||
            target.attribs?.tabindex !== "0" ||
            !target.attribs?.["aria-label"]?.trim()
          ) {
            errors.push(
              `Diagram label "${labelId}" must link to a focusable, accessibly named leader endpoint marker in the same <figure>.`,
            )
          }

          const leaders = leaderPrimitives.filter((node) => node.attribs?.["data-label-id"] === labelId)
          if (leaders.length !== 1 || !linkId) {
            errors.push(
              `Diagram label "${labelId}" must have one explicitly associated SVG leader and a named label-side anchor.`,
            )
            continue
          }
          if (!hasLabelBackground(link)) {
            errors.push(
              `Diagram label "${labelId}" must have an opaque background where its leader underlaps the label edge.`,
            )
          }

          const leader = leaders[0]
          const labelContact = leader.attribs?.["data-label-contact"]
          const labelledBy = leader.attribs?.["aria-labelledby"]?.split(/\s+/) ?? []
          if (
            !["start", "end"].includes(labelContact ?? "") ||
            !labelledBy.includes(linkId) ||
            !labelledBy.includes(targetId)
          ) {
            errors.push(
              `Diagram leader for "${labelId}" must identify its label-side contact and reference both named endpoints.`,
            )
          }

          const endpoints = endpointCoordinates(leader)
          if (endpoints && target) {
            const featurePoint = labelContact === "end" ? endpoints.start : endpoints.end
            if (!pointMatchesMarker(featurePoint, target)) {
              errors.push(`Diagram leader for "${labelId}" must terminate exactly on its named feature marker.`)
            }
          }
        }
      }
    }
  }

  return errors
}
