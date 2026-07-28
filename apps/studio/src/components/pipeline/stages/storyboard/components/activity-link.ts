/**
 * Shared anchor vocabulary for the two-way link between the classic-activity
 * editor and the rendered page. Texts and images are addressed by `data-id`,
 * answers by `data-activity-item`, so a click on either surface resolves to
 * exactly one target on the other.
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

export function anchorKey(anchor: ActivityAnchor): string {
  return `${anchor.kind}:${anchor.id}`
}

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

export function anchorSelector(anchor: ActivityAnchor): string {
  const escaped = CSS.escape(anchor.id)
  return anchor.kind === "answer"
    ? `[data-activity-item="${escaped}"]`
    : `[data-id="${escaped}"]`
}

export function resolveVisibleTarget(el: Element): Element {
  let node: Element | null = el
  for (let depth = 0; depth < 4 && node; depth++) {
    const rect = node.getBoundingClientRect()
    if (rect.width > 2 && rect.height > 2) return node
    node = node.parentElement
  }
  return el
}

export function parseAnchor(kind: unknown, id: unknown): ActivityAnchor | null {
  if (typeof id !== "string" || !id) return null
  if (kind !== "text" && kind !== "image" && kind !== "answer") return null
  return { kind, id }
}
