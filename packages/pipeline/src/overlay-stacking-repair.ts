import { parseDocument, DomUtils } from "htmlparser2"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

const POSITION_OVERLAY = new Set(["absolute", "fixed"])
const POSITION_ANY = new Set(["absolute", "fixed", "relative", "sticky", "static"])
const DECORATIVE_TEXT_RE = /^[\d\s.,:;·•|/\\–—-]*$/u
const TAILWIND_Z_STEPS = [0, 10, 20, 30, 40, 50]

function isTag(node: Node): boolean {
  return node?.type === "tag"
}

function classTokens(node: Node): string[] {
  const raw = node?.attribs?.class
  if (typeof raw !== "string" || raw.length === 0) return []
  return raw.split(/\s+/).filter(Boolean)
}

function baseTokens(node: Node): string[] {
  return classTokens(node).filter((t) => !t.includes(":"))
}

function positionOf(node: Node): string | null {
  for (const t of baseTokens(node)) if (POSITION_ANY.has(t)) return t
  return null
}

function isOverlay(node: Node): boolean {
  const pos = positionOf(node)
  return pos !== null && POSITION_OVERLAY.has(pos)
}

function zIndexOf(node: Node): number {
  for (const t of baseTokens(node)) {
    if (!t.startsWith("z-")) continue
    const v = t.slice(2)
    if (v === "auto") return 0
    const bracketed = v.match(/^\[(-?\d+)\]$/)
    if (bracketed) return Number(bracketed[1])
    if (/^-?\d+$/.test(v)) return Number(v)
  }
  return 0
}

function subtreeText(node: Node): string {
  return DomUtils.textContent(node).replace(/\s+/g, " ").trim()
}

function containsImage(node: Node): boolean {
  if (isTag(node) && ["img", "svg", "picture", "video", "canvas"].includes(node.name)) return true
  return (node.children ?? []).some((c: Node) => containsImage(c))
}

function isDecorative(node: Node): boolean {
  if (node?.attribs?.["aria-hidden"] === "true") return true
  if (containsImage(node)) return true
  return DECORATIVE_TEXT_RE.test(subtreeText(node))
}

function collectDescendants(node: Node, acc: Node[] = []): Node[] {
  for (const child of node.children ?? []) {
    if (isTag(child)) acc.push(child)
    collectDescendants(child, acc)
  }
  return acc
}

function wouldReanchorDescendants(node: Node): boolean {
  for (const d of collectDescendants(node)) {
    if (!isOverlay(d)) continue
    let p = d.parent
    let shielded = false
    while (p && p !== node) {
      const pos = positionOf(p)
      if (pos !== null && pos !== "static") {
        shielded = true
        break
      }
      p = p.parent
    }
    if (!shielded) return true
  }
  return false
}

function nextZAbove(z: number): string {
  const step = TAILWIND_Z_STEPS.find((s) => s > z)
  return step === undefined ? `z-[${z + 10}]` : `z-${step}`
}

function setStacking(node: Node, z: number): void {
  const tokens = classTokens(node)
  const kept = tokens.filter((t) => !(t.startsWith("z-") && !t.includes(":")))
  const zClass = nextZAbove(z)
  if (positionOf(node) === null) kept.unshift("relative")
  kept.push(zClass)
  node.attribs = { ...(node.attribs ?? {}), class: kept.join(" ") }
}

function repairChildren(parent: Node): boolean {
  const children = (parent.children ?? []).filter(isTag)
  if (children.length < 2) return false

  const decorativeOverlays = children.filter((c: Node) => isOverlay(c) && isDecorative(c))
  if (decorativeOverlays.length === 0) return false

  const maxDecorZ = Math.max(...decorativeOverlays.map(zIndexOf))
  let changed = false

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (decorativeOverlays.includes(child)) continue
    if (!subtreeText(child)) continue
    if (isDecorative(child) && DECORATIVE_TEXT_RE.test(subtreeText(child))) continue

    const pos = positionOf(child)
    const isStatic = pos === null || pos === "static"
    if (isStatic && wouldReanchorDescendants(child)) continue
    if (!isStatic) {
      const childZ = zIndexOf(child)
      if (childZ > maxDecorZ) continue
      const losesToLaterOverlay = decorativeOverlays.some(
        (o: Node) => children.indexOf(o) > i && zIndexOf(o) >= childZ,
      )
      if (!losesToLaterOverlay) continue
    }
    setStacking(child, maxDecorZ)
    changed = true
  }
  return changed
}

function walk(node: Node, onParent: (n: Node) => boolean): boolean {
  let changed = false
  if (isTag(node) && onParent(node)) changed = true
  for (const child of node.children ?? []) {
    if (walk(child, onParent)) changed = true
  }
  return changed
}

/**
 * Raise text above decorative overlays that would paint on top of it.
 *
 * The renderer sometimes emits a text container that loses the stacking
 * contest against an absolutely positioned sibling — either because the text
 * container is unpositioned (any positioned sibling paints above static
 * content) or because it carries the same z-index and comes earlier in DOM
 * order. The text is then present in the DOM but partly or wholly invisible.
 *
 * The comparison is made per parent, because z-index only orders elements
 * within a shared stacking context: lifting a nested descendant cannot move it
 * above an overlay that competes with one of its ancestors.
 *
 * An overlay counts as decorative when it is `aria-hidden`, contains an image,
 * or holds nothing but digits and punctuation (page-number tabs).
 */
export function repairOverlayStacking(html: string): string {
  if (!html || !html.includes("absolute") && !html.includes("fixed")) return html
  const doc = parseDocument(html)
  const changed = walk(doc, repairChildren)
  return changed ? DomUtils.getOuterHTML(doc) : html
}
