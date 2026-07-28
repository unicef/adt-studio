/**
 * Shared anchor vocabulary for the two-way link between the classic-activity
 * editor panel and the rendered page in the preview iframe.
 *
 * Both sides already address the same content deterministically — texts and
 * images by `data-id`, answer fields by `data-activity-item` (the item-id the
 * answer key is stored under). An anchor is just that pair, so a click in the
 * page resolves to exactly one editor field and vice versa; no positional or
 * heuristic matching is involved.
 */

export type ActivityAnchorKind = "text" | "image" | "answer"

export interface ActivityAnchor {
  kind: ActivityAnchorKind
  id: string
}

export function textAnchor(id: string): ActivityAnchor {
  return { kind: "text", id }
}

export function imageAnchor(id: string): ActivityAnchor {
  return { kind: "image", id }
}

export function answerAnchor(id: string): ActivityAnchor {
  return { kind: "answer", id }
}

/** Stable identity string — usable as a React key or a DOM attribute. */
export function anchorKey(anchor: ActivityAnchor): string {
  return `${anchor.kind}:${anchor.id}`
}

/** Inverse of {@link anchorKey}; ids may contain ":" so only split once. */
export function parseAnchorKey(key: string | null | undefined): ActivityAnchor | null {
  if (!key) return null
  const sep = key.indexOf(":")
  if (sep < 0) return null
  return parseAnchor(key.slice(0, sep), key.slice(sep + 1))
}

export function sameAnchor(
  a: ActivityAnchor | null | undefined,
  b: ActivityAnchor | null | undefined,
): boolean {
  if (!a || !b) return false
  return a.kind === b.kind && a.id === b.id
}

/**
 * CSS selector locating the anchor inside the preview document. Images and
 * texts share the `data-id` channel — the kind only tells the editor which
 * control to focus, so it doesn't change the selector.
 */
export function anchorSelector(anchor: ActivityAnchor): string {
  const escaped = CSS.escape(anchor.id)
  return anchor.kind === "answer"
    ? `[data-activity-item="${escaped}"]`
    : `[data-id="${escaped}"]`
}

/**
 * The element to outline for an anchor. Answer controls are routinely
 * `sr-only` (the visible affordance is a styled sibling box), so outlining the
 * matched element itself would draw nothing — climb to the first ancestor with
 * a real box, which is the option label or field wrapper.
 */
export function resolveVisibleTarget(el: Element): Element {
  let node: Element | null = el
  for (let depth = 0; depth < 4 && node; depth++) {
    const rect = node.getBoundingClientRect()
    if (rect.width > 2 && rect.height > 2) return node
    node = node.parentElement
  }
  return el
}

/** Narrow an untrusted postMessage payload to an anchor. */
export function parseAnchor(kind: unknown, id: unknown): ActivityAnchor | null {
  if (typeof id !== "string" || !id) return null
  if (kind !== "text" && kind !== "image" && kind !== "answer") return null
  return { kind, id }
}
