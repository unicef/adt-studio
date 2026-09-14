import { useCallback, useEffect, useRef, useState } from "react"
import { contentRoot, resolveAnchor, type CommentAnchor } from "@/features/comments/lib/anchor"

export interface AnchorTarget {
  id: string
  anchor: CommentAnchor | null
}

export interface AnchorPosition {
  x: number
  y: number
}

/**
 * Viewport positions for a set of anchors, kept in sync with layout.
 *
 * Pins live on a fixed overlay, so every position is viewport-relative and has
 * to be re-read whenever the page scrolls, the window resizes, `#content`
 * changes size, its DOM mutates (activity feedback, glossary highlighting,
 * translated text being swapped in) or a late image finishes loading and pushes
 * the text down. All of that funnels into one rAF-throttled measuring pass so a
 * scroll costs a single layout read per frame.
 *
 * An anchor missing from the map is unresolvable — an unambiguous element could
 * not be found — and its comment degrades to page level.
 */
export function useAnchorPositions(targets: AnchorTarget[]): Map<string, AnchorPosition> {
  const [positions, setPositions] = useState<Map<string, AnchorPosition>>(new Map())
  const targetsRef = useRef(targets)
  targetsRef.current = targets

  const frameRef = useRef<number | null>(null)

  const measure = useCallback(() => {
    frameRef.current = null
    const root = contentRoot()
    if (!root) {
      setPositions((previous) => (previous.size === 0 ? previous : new Map()))
      return
    }

    const next = new Map<string, AnchorPosition>()
    for (const target of targetsRef.current) {
      if (!target.anchor) continue
      const resolved = resolveAnchor(target.anchor, { root })
      if (!resolved) continue
      next.set(target.id, resolved.position())
    }

    setPositions((previous) => (sameMap(previous, next) ? previous : next))
  }, [])

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(measure)
  }, [measure])

  useEffect(() => {
    schedule()
  }, [schedule, targets])

  useEffect(() => {
    const root = contentRoot()
    window.addEventListener("resize", schedule)
    document.addEventListener("scroll", schedule, true)
    document.addEventListener("load", schedule, true)
    window.addEventListener("adt:dock-resize", schedule)

    const resizeObserver = new ResizeObserver(schedule)
    const mutationObserver = new MutationObserver(schedule)
    if (root) {
      resizeObserver.observe(root)
      mutationObserver.observe(root, { childList: true, subtree: true, characterData: true })
    }

    return () => {
      window.removeEventListener("resize", schedule)
      document.removeEventListener("scroll", schedule, true)
      document.removeEventListener("load", schedule, true)
      window.removeEventListener("adt:dock-resize", schedule)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [schedule])

  return positions
}

function sameMap(a: Map<string, AnchorPosition>, b: Map<string, AnchorPosition>): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) {
    const other = b.get(key)
    if (!other || other.x !== value.x || other.y !== value.y) return false
  }
  return true
}
