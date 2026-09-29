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

/** The room refuses a cursor frame whose selector is longer than this (`RoomCursorMoveFrame`). */
const ROOM_SELECTOR_MAX_LENGTH = 512

/**
 * The exact element, named from its nearest hooked ancestor rather than from `#content`: the
 * steps in between carry no hook, so they are positional, and starting from the hook keeps the
 * path short enough for the room on even a deeply nested page. `null` when it would not be
 * unique or would not fit, and the caller falls back to the hooked ancestor itself.
 */
function selectorWithin(element: Element, hooked: Element, root: Element): string | null {
  const base = selectorFor(hooked, root)
  if (!base) return null
  const segments: string[] = []
  let current: Element | null = element
  while (current && current !== hooked) {
    segments.unshift(positionalSegment(current))
    current = current.parentElement
  }
  if (current !== hooked) return null
  const selector = [base, ...segments].join(" > ")
  if (selector.length > ROOM_SELECTOR_MAX_LENGTH) return null
  return matchesUniquely(selector, element, root) ? selector : null
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
  /**
   * For live cursors. A pin is meant to outlive the markup around it, so it climbs to the
   * nearest stable hook — often a whole section. A cursor only has to agree with the other
   * readers of the *same* version for a moment, so it anchors to the exact element under the
   * pointer and measures across a picture's painted image rather than its cropped box. That is
   * what keeps two readers at different widths pointing at the same thing when the layout
   * reflows: a caption box that stacks under the photo on a phone, a cover cropped to 4:5.
   */
  precise?: boolean
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** One `object-position` component (`"50%"`, `"12px"`) as an offset into the free space. */
function positionOffset(token: string | undefined, free: number): number {
  if (!token) return free / 2
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value)) return free / 2
  return token.trim().endsWith("%") ? (free * value) / 100 : value
}

/**
 * Where a replaced element actually paints its image inside `box`, per `object-fit` and
 * `object-position` — the part of the layout that changes with the viewport while the picture
 * itself does not. Pure, so it is testable without a browser's layout.
 */
export function paintedBox(
  box: Box,
  natural: { width: number; height: number },
  fit: string,
  position: string,
): Box {
  if (natural.width <= 0 || natural.height <= 0 || box.width <= 0 || box.height <= 0) return box
  const fitScale = (mode: "cover" | "contain") =>
    (mode === "cover" ? Math.max : Math.min)(box.width / natural.width, box.height / natural.height)
  let scale: number
  if (fit === "cover") scale = fitScale("cover")
  else if (fit === "contain") scale = fitScale("contain")
  else if (fit === "none") scale = 1
  else if (fit === "scale-down") scale = Math.min(1, fitScale("contain"))
  else return box
  const width = natural.width * scale
  const height = natural.height * scale
  const [x, y] = position.trim().split(/\s+/)
  return {
    left: box.left + positionOffset(x, box.width - width),
    top: box.top + positionOffset(y, box.height - height),
    width,
    height,
  }
}

function naturalSize(element: Element): { width: number; height: number } | null {
  const view = element.ownerDocument.defaultView
  if (view && element instanceof view.HTMLImageElement && element.naturalWidth > 0) {
    return { width: element.naturalWidth, height: element.naturalHeight }
  }
  if (view && element instanceof view.HTMLVideoElement && element.videoWidth > 0) {
    return { width: element.videoWidth, height: element.videoHeight }
  }
  return null
}

/** The box offsets are measured across: the element's own, or — precisely — its painted image. */
function measuredBox(element: Element, precise: boolean): Box {
  const rect = element.getBoundingClientRect()
  if (!precise) return rect
  const natural = naturalSize(element)
  const view = element.ownerDocument.defaultView
  if (!natural || !view) return rect
  const style = view.getComputedStyle(element)
  return paintedBox(rect, natural, style.objectFit, style.objectPosition)
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

  const precise = options.precise === true
  const hooked = nearestAnchorElement(element, root)
  if (!hooked) return null

  /** The exact element when precise — falling back to the hooked ancestor when the exact one
   *  has no selector that names it alone, so a cursor never degrades to nothing. */
  const exactSelector = precise && element !== hooked ? selectorWithin(element, hooked, root) : null
  const anchorElement = exactSelector ? element : hooked
  const selector = exactSelector ?? selectorFor(hooked, root)
  if (!selector) return null

  const rect = measuredBox(anchorElement, precise)
  return {
    selector,
    xOffsetPct: offsetPercent(clientX, rect.left, rect.width),
    yOffsetPct: offsetPercent(clientY, rect.top, rect.height),
  }
}

/**
 * The topmost book-content element under a viewport point, ignoring the pin
 * overlay that sits above it. `elementsFromPoint` (plural) is what makes a drag
 * work: the pin being dragged is under the pointer by definition, so the
 * singular call would hand back the pin and every drop would anchor to nothing.
 */
export function elementAtPoint(
  clientX: number,
  clientY: number,
  root: Element,
): Element | null {
  const doc = root.ownerDocument as Document & {
    elementsFromPoint?: (x: number, y: number) => Element[]
  }
  const stack = doc.elementsFromPoint?.(clientX, clientY) ?? []
  for (const candidate of stack) {
    if (candidate === root || root.contains(candidate)) return candidate
  }
  return null
}

/**
 * Anchor a dropped pin. `null` when the point is not over book content — which
 * is how a drag that ends on the dock, on a popover or off the page reverts
 * instead of silently re-anchoring to the page as a whole.
 */
export function anchorFromPoint(
  clientX: number,
  clientY: number,
  options: BuildAnchorOptions = {},
): CommentAnchor | null {
  const root = options.root ?? contentRoot()
  if (!root) return null
  const element = elementAtPoint(clientX, clientY, root)
  if (!element) return null
  return buildAnchor(element, clientX, clientY, { root, precise: options.precise })
}

export interface ElementAnchor {
  anchor: CommentAnchor
  /** Viewport point the composer should hang off — the element's centre. */
  point: { x: number; y: number }
}

/**
 * Anchor to an element rather than to a point, for the keyboard path: there is
 * no pointer, so the centre of whatever the reviewer has focused is the honest
 * equivalent of where they would have clicked.
 */
export function anchorForElement(
  element: Element,
  options: BuildAnchorOptions = {},
): ElementAnchor | null {
  const root = options.root ?? contentRoot(element.ownerDocument)
  if (!root) return null

  const rect = element.getBoundingClientRect()
  const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  const anchor = buildAnchor(element, point.x, point.y, { root })
  return anchor ? { anchor, point } : null
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
  const precise = options.precise === true
  return {
    element,
    position: () => {
      const rect = measuredBox(element, precise)
      return {
        x: rect.left + (rect.width * anchor.xOffsetPct) / 100,
        y: rect.top + (rect.height * anchor.yOffsetPct) / 100,
      }
    },
  }
}
