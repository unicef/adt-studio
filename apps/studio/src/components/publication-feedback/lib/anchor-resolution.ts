import type { CommentAnchor } from "@/api/client"

/**
 * The *resolution* half of the published reader's pin anchoring, reimplemented for the
 * Studio.
 *
 * The reader owns the builder (`apps/adt-runtime/.../lib/anchor.ts`): turning a click into a
 * selector is only ever done where the click happens. The Studio never builds an anchor — it
 * only reads the ones reviewers left — and the layer rule in AGENTS.md forbids importing from
 * `apps/adt-runtime`, so the reading half lives here. Three semantics are copied deliberately
 * and must not drift:
 *
 * 1. selectors are `querySelectorAll`-matched and scoped to `#content`;
 * 2. **ambiguity is failure** — a selector matching two nodes yields no pin at all, because a
 *    pin in the wrong place is worse than a thread that says "not on this version";
 * 3. offsets are percentages of the matched element's own box, so a pin lands on the same
 *    words at any width.
 */

export const CONTENT_ROOT_ID = "content"

export interface AnchorPoint {
  /** Coordinates inside the anchored document's own viewport. */
  x: number
  y: number
}

export function contentRoot(doc: Document | null | undefined): Element | null {
  return doc?.getElementById(CONTENT_ROOT_ID) ?? null
}

export function resolveAnchorElement(
  anchor: CommentAnchor,
  root: Element | null,
): Element | null {
  if (!root) return null
  const doc = root.ownerDocument
  let matches: Element[]
  try {
    matches = Array.from(doc.querySelectorAll(anchor.selector))
  } catch {
    return null
  }
  const scoped = matches.filter((match) => match === root || root.contains(match))
  return scoped.length === 1 ? (scoped[0] as Element) : null
}

/** Viewport point for a stored anchor, or `null` when the selector no longer resolves. */
export function resolveAnchorPoint(
  anchor: CommentAnchor,
  root: Element | null,
): AnchorPoint | null {
  const element = resolveAnchorElement(anchor, root)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + (rect.width * anchor.xOffsetPct) / 100,
    y: rect.top + (rect.height * anchor.yOffsetPct) / 100,
  }
}

export function scrollAnchorIntoView(
  anchor: CommentAnchor,
  root: Element | null,
  behavior: ScrollBehavior,
): boolean {
  const element = resolveAnchorElement(anchor, root)
  if (!element) return false
  element.scrollIntoView({ behavior, block: "center", inline: "nearest" })
  return true
}
