/**
 * Horizontal space the reader chrome takes from the book.
 *
 * Two things can claim a side of the viewport: a dock docked as a vertical
 * rail, and a drawer panel in "push" mode. Each registers its width here under
 * its own source; the totals are published on `<html>` as CSS variables:
 *
 *   --adt-rail-left / --adt-rail-right       the dock rail alone
 *   --adt-drawer-left / --adt-drawer-right   a pushing drawer alone
 *   --adt-inset-left / --adt-inset-right     everything (what the book loses)
 *
 * While any inset is claimed, `globals.css` turns `<body>` into a fixed,
 * self-scrolling box between them — the book's own viewport — and the
 * fixed-layout fit script reads the same variables to scale `#content`. Both
 * follow `adt:dock-resize`, which is dispatched on every change. Code that
 * reads or sets the reading position uses `getPageScrollTop`/`setPageScrollTop`.
 *
 * Variables live on `<html>` and the flag on a `<body>` attribute because an
 * in-place page swap replaces the body's `class` and `style` wholesale.
 */
export type ChromeInsetSource = "rail" | "drawer"
export type ChromeInsetSide = "left" | "right"

const insets: Record<ChromeInsetSource, Record<ChromeInsetSide, number>> = {
  rail: { left: 0, right: 0 },
  drawer: { left: 0, right: 0 },
}

export const CHROME_INSETS_ATTR = "data-adt-insets"

function publish(): void {
  if (typeof document === "undefined") return
  const root = document.documentElement.style
  let any = false
  for (const side of ["left", "right"] as const) {
    const rail = insets.rail[side]
    const drawer = insets.drawer[side]
    root.setProperty(`--adt-rail-${side}`, `${rail}px`)
    root.setProperty(`--adt-drawer-${side}`, `${drawer}px`)
    root.setProperty(`--adt-inset-${side}`, `${rail + drawer}px`)
    if (rail + drawer > 0) any = true
  }
  const body = document.body
  if (body) {
    // The flag turns <body> into the scroll container (see globals.css), so
    // hand the reading position over from the window to it, or back.
    const wasScroller = body.hasAttribute(CHROME_INSETS_ATTR)
    if (wasScroller !== any) {
      const top = wasScroller ? body.scrollTop : window.scrollY
      if (any) {
        body.setAttribute(CHROME_INSETS_ATTR, "")
        body.scrollTop = top
      } else {
        body.removeAttribute(CHROME_INSETS_ATTR)
        window.scrollTo({ top, behavior: "instant" })
      }
    }
  }
  window.dispatchEvent(new Event("adt:dock-resize"))
}

/** Claim `px` of one side for `source`, releasing whatever it held before. */
export function setChromeInset(
  source: ChromeInsetSource,
  side: ChromeInsetSide | null,
  px: number,
): void {
  const next = { left: 0, right: 0 }
  if (side) next[side] = Math.max(0, Math.round(px))
  const prev = insets[source]
  if (prev.left === next.left && prev.right === next.right) return
  insets[source] = next
  publish()
}

export function clearChromeInset(source: ChromeInsetSource): void {
  setChromeInset(source, null, 0)
}

/** Test seam: the totals as they stand. */
export function readChromeInsets(): Record<ChromeInsetSide, number> {
  return {
    left: insets.rail.left + insets.drawer.left,
    right: insets.rail.right + insets.drawer.right,
  }
}

/** The element the book scrolls in: `<body>` while chrome claims a side, else the window. */
export function pageScroller(): HTMLElement | null {
  if (typeof document === "undefined") return null
  return document.body?.hasAttribute(CHROME_INSETS_ATTR) ? document.body : null
}

export function getPageScrollTop(): number {
  const el = pageScroller()
  return el ? el.scrollTop : window.scrollY
}

export function setPageScrollTop(top: number): void {
  const el = pageScroller()
  if (el) el.scrollTop = top
  else window.scrollTo({ top, behavior: "instant" })
}
