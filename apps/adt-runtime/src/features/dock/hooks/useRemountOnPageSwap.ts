/**
 * Re-mount an open dock panel's popup once an in-place page turn lands (#1135).
 *
 * When a Base UI popover opens it tags every element on the page, and from
 * then on it ignores outside presses on untagged elements, taking them for
 * widgets injected later (a browser extension's, say). An in-place page turn
 * (`page-swap.ts`) replaces `<main>` with a new, untagged element, so a panel
 * left open across the turn could no longer be closed by clicking the page.
 * Base UI tags the page when the popup mounts, so the popup gets a new `key`.
 *
 * Panels stay open across a page turn on purpose (a reader browsing the
 * contents keeps browsing), so the re-mount must not show:
 *   - `remounted` tells the popup not to take focus, which the page turn has
 *     just put on the new `<main>`, and not to replay its entry animation;
 *   - `ref` carries the popup's scroll positions over to the new popup.
 * Other state that must survive lives outside the popup (the Contents search).
 */
import { useCallback, useEffect, useRef, useState } from "react"

const PAGE_CHANGED_EVENT = "adt:page-changed"

/** [index among the popup's descendants, scrollTop, scrollLeft] */
type ScrollSnapshot = Array<[number, number, number]>

function readScroll(root: HTMLElement | null): ScrollSnapshot | null {
  if (!root) return null
  const snapshot: ScrollSnapshot = []
  root.querySelectorAll("*").forEach((el, index) => {
    if (el.scrollTop || el.scrollLeft) snapshot.push([index, el.scrollTop, el.scrollLeft])
  })
  return snapshot.length > 0 ? snapshot : null
}

function writeScroll(root: HTMLElement, snapshot: ScrollSnapshot): void {
  const all = root.querySelectorAll("*")
  for (const [index, top, left] of snapshot) {
    const el = all[index]
    if (!el) continue
    el.scrollTop = top
    el.scrollLeft = left
  }
}

export function useRemountOnPageSwap(open: boolean) {
  const [key, setKey] = useState(0)
  const [remounted, setRemounted] = useState(false)
  const popupRef = useRef<HTMLElement | null>(null)
  const pendingScroll = useRef<ScrollSnapshot | null>(null)

  useEffect(() => {
    if (!open) {
      // The next time the panel opens is a real opening again.
      setRemounted(false)
      return
    }
    const onPageChanged = () => {
      pendingScroll.current = readScroll(popupRef.current)
      setRemounted(true)
      setKey((n) => n + 1)
    }
    document.addEventListener(PAGE_CHANGED_EVENT, onPageChanged)
    return () => document.removeEventListener(PAGE_CHANGED_EVENT, onPageChanged)
  }, [open])

  // Called with each popup element once it is in the document, children
  // included, so its scroll containers can take their old positions back.
  const ref = useCallback((el: HTMLElement | null) => {
    popupRef.current = el
    if (el && pendingScroll.current) {
      writeScroll(el, pendingScroll.current)
      pendingScroll.current = null
    }
  }, [])

  return { key, ref, remounted: open && remounted }
}
