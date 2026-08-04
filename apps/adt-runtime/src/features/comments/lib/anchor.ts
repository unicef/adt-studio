/**
 * Pin anchoring for the published reader.
 *
 * A pin is stored as a CSS selector rooted at `#content` plus a percentage
 * offset inside the matched element's box. Percentages (not pixels) are what
 * make a pin land on the same words for two reviewers at different viewport
 * widths, and a snapshot's DOM is frozen per version, so a selector cannot rot
 * while a version is live.
 *
 * Every function here is pure with respect to the DOM it is handed: the root
 * element is a parameter, so the engine is unit-testable against exported page
 * fixtures without a browser.
 */

export const CONTENT_ROOT_ID = "content"

export const CONTENT_ROOT_SELECTOR = `#${CONTENT_ROOT_ID}`

/**
 * Attributes the packaging pipeline stamps on content nodes, most specific
 * first. `data-section-id` is the coarsest of the three and is what keeps a
 * click on section padding anchored to that section rather than to the page.
 */
const HOOK_ATTRIBUTES = ["data-id", "data-area-id", "data-section-id"] as const

export interface CommentAnchor {
  selector: string
  xOffsetPct: number
  yOffsetPct: number
}

export interface ResolvedAnchor {
  element: Element
  /** Viewport coordinates of the pin, re-read from layout on every call. */
  position: () => { x: number; y: number }
}

export function contentRoot(doc: Document | null = globalThis.document ?? null): Element | null {
  return doc?.getElementById(CONTENT_ROOT_ID) ?? null
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * A stable, human-legible segment for one element, or `null` when the element
 * carries no hook the pipeline guarantees.
 */
function hookSegment(element: Element): string | null {
  for (const attribute of HOOK_ATTRIBUTES) {
    const value = element.getAttribute(attribute)
    if (value) return `[${attribute}="${escapeAttributeValue(value)}"]`
  }
  const id = element.getAttribute("id")
  if (id) return `[id="${escapeAttributeValue(id)}"]`
  return null
}

function positionalSegment(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const parent = element.parentElement
  if (!parent) return tag
  let index = 0
  for (const sibling of Array.from(parent.children)) {
    if (sibling.tagName === element.tagName) index += 1
    if (sibling === element) break
  }
  return `${tag}:nth-of-type(${index})`
}

function hasHook(element: Element): boolean {
  return hookSegment(element) !== null
}

/**
 * Nearest self-or-ancestor carrying a stable hook, bounded by `root`. Falls
 * back to `root` itself, which is why a click on page padding still produces a
 * usable (page-wide) anchor rather than nothing.
 */
export function nearestAnchorElement(element: Element, root: Element): Element | null {
  if (element !== root && !root.contains(element)) return null
  let current: Element | null = element
  while (current && current !== root) {
    if (hasHook(current)) return current
    current = current.parentElement
  }
  return root
}

function pathSegments(element: Element, root: Element): string[] | null {
  const segments: string[] = []
  let current: Element | null = element
  while (current && current !== root) {
    segments.unshift(hookSegment(current) ?? positionalSegment(current))
    current = current.parentElement
  }
  return current === root ? segments : null
}

function matchesUniquely(selector: string, element: Element, root: Element): boolean {
  const doc = root.ownerDocument
  let matches: Element[]
  try {
    matches = Array.from(doc.querySelectorAll(selector))
  } catch {
    return false
  }
  const scoped = matches.filter((match) => match === root || root.contains(match))
  return scoped.length === 1 && scoped[0] === element
}

function selectorFor(element: Element, root: Element): string | null {
  if (element === root) return CONTENT_ROOT_SELECTOR

  const hook = hookSegment(element)
  if (hook) {
    const short = `${CONTENT_ROOT_SELECTOR} ${hook}`
    if (matchesUniquely(short, element, root)) return short
  }

  const segments = pathSegments(element, root)
  if (!segments) return null
  const full = [CONTENT_ROOT_SELECTOR, ...segments].join(" > ")
  return matchesUniquely(full, element, root) ? full : null
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value * 100) / 100
}

function offsetPercent(point: number, start: number, size: number): number {
  if (size <= 0) return 50
  return clampPercent(((point - start) / size) * 100)
}

export interface BuildAnchorOptions {
  root?: Element | null
}

/**
 * Turn a click on book content into a storable anchor. `clientX` / `clientY`
 * are viewport coordinates, exactly as a `MouseEvent` reports them.
 */
export function buildAnchor(
  element: Element,
  clientX: number,
  clientY: number,
  options: BuildAnchorOptions = {},
): CommentAnchor | null {
  const root = options.root ?? contentRoot(element.ownerDocument)
  if (!root) return null

  const anchorElement = nearestAnchorElement(element, root)
  if (!anchorElement) return null

  const selector = selectorFor(anchorElement, root)
  if (!selector) return null

  const rect = anchorElement.getBoundingClientRect()
  return {
    selector,
    xOffsetPct: offsetPercent(clientX, rect.left, rect.width),
    yOffsetPct: offsetPercent(clientY, rect.top, rect.height),
  }
}

/**
 * Resolve a stored anchor back to an element. Ambiguity is failure: a selector
 * that matches two nodes could put the pin on the wrong one, and a pin in the
 * wrong place is worse than a pin that degrades to the page.
 */
export function resolveAnchor(
  anchor: CommentAnchor,
  options: BuildAnchorOptions = {},
): ResolvedAnchor | null {
  const root = options.root ?? contentRoot()
  if (!root) return null

  const doc = root.ownerDocument
  let matches: Element[]
  try {
    matches = Array.from(doc.querySelectorAll(anchor.selector))
  } catch {
    return null
  }

  const scoped = matches.filter((match) => match === root || root.contains(match))
  if (scoped.length !== 1) return null

  const element = scoped[0]
  return {
    element,
    position: () => {
      const rect = element.getBoundingClientRect()
      return {
        x: rect.left + (rect.width * anchor.xOffsetPct) / 100,
        y: rect.top + (rect.height * anchor.yOffsetPct) / 100,
      }
    },
  }
}
