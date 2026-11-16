import { useCallback, useEffect, useMemo, useRef } from "react"
import { isTypingTarget } from "@/features/navigation/lib/typing-target"
import { contentRoot } from "@/features/comments/lib/anchor"
import {
  CONTENT_TARGET_ATTRIBUTE,
  contentTargets,
  stepTarget,
  targetIndexOf,
} from "@/features/comments/lib/targets"

/**
 * Roving-tabindex walker over `#content`, the keyboard path to placing a pin.
 *
 * Book content is not focusable — it is prose, images and activity markup — so
 * comment mode lends every stable hook a `tabindex="-1"` and hands exactly one
 * of them `tabindex="0"`. That single stop is what puts the page itself in the
 * tab order: the reviewer tabs into the content, arrows to the part they mean,
 * and presses Enter. Screen readers read each stop as they land on it, so the
 * choice is made on the content itself rather than on a menu of coordinates.
 *
 * The original `tabindex` of every element it touches is restored on cleanup, so
 * an activity that manages its own focus order is handed back unchanged.
 */
export interface ContentWalker {
  /** Focus a specific element in the ring (used when a move starts). */
  focusElement: (element: Element | null) => void
  /** Focus the current stop, or the first one. */
  focusFirst: () => void
}

export interface UseContentWalkerOptions {
  active: boolean
  onCommit: (element: Element) => void
  onCancel: () => void
}

export function useContentWalker({
  active,
  onCommit,
  onCancel,
}: UseContentWalkerOptions): ContentWalker {
  const indexRef = useRef(0)
  const touchedRef = useRef<Map<Element, string | null>>(new Map())
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  const targets = useCallback((): Element[] => {
    const root = contentRoot()
    return root ? contentTargets(root) : []
  }, [])

  const mark = useCallback(
    (list: Element[], activeIndex: number) => {
      const touched = touchedRef.current
      for (const element of list) {
        if (!touched.has(element)) touched.set(element, element.getAttribute("tabindex"))
        element.setAttribute(CONTENT_TARGET_ATTRIBUTE, "")
        element.setAttribute("tabindex", element === list[activeIndex] ? "0" : "-1")
      }
    },
    [],
  )

  const restore = useCallback(() => {
    for (const [element, tabindex] of touchedRef.current) {
      element.removeAttribute(CONTENT_TARGET_ATTRIBUTE)
      if (tabindex === null) element.removeAttribute("tabindex")
      else element.setAttribute("tabindex", tabindex)
    }
    touchedRef.current = new Map()
  }, [])

  const moveTo = useCallback(
    (list: Element[], index: number, focus: boolean) => {
      if (index < 0 || index >= list.length) return
      indexRef.current = index
      mark(list, index)
      if (!focus) return
      const element = list[index] as HTMLElement
      element.focus({ preventScroll: true })
      element.scrollIntoView({ block: "nearest", inline: "nearest" })
    },
    [mark],
  )

  useEffect(() => {
    if (!active) return
    const list = targets()
    if (list.length === 0) return
    moveTo(list, Math.min(indexRef.current, list.length - 1), false)
    return restore
  }, [active, moveTo, restore, targets])

  useEffect(() => {
    if (!active) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      const focused = event.target as Element | null
      if (!focused?.closest?.(`[${CONTENT_TARGET_ATTRIBUTE}]`)) return

      const list = targets()
      const current = targetIndexOf(list, focused)

      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          event.preventDefault()
          moveTo(list, stepTarget(list, current, 1), true)
          return
        case "ArrowUp":
        case "ArrowLeft":
          event.preventDefault()
          moveTo(list, stepTarget(list, current, -1), true)
          return
        case "Home":
          event.preventDefault()
          moveTo(list, 0, true)
          return
        case "End":
          event.preventDefault()
          moveTo(list, list.length - 1, true)
          return
        case "Enter":
        case " ":
          if (current === -1) return
          event.preventDefault()
          onCommitRef.current(list[current])
          return
        case "Escape":
          event.preventDefault()
          onCancelRef.current()
          return
        default:
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [active, moveTo, targets])

  const focusElement = useCallback(
    (element: Element | null) => {
      const list = targets()
      if (list.length === 0) return
      const index = targetIndexOf(list, element)
      moveTo(list, index === -1 ? 0 : index, true)
    },
    [moveTo, targets],
  )

  const focusFirst = useCallback(() => {
    const list = targets()
    moveTo(list, Math.min(indexRef.current, Math.max(list.length - 1, 0)), true)
  }, [moveTo, targets])

  return useMemo(() => ({ focusElement, focusFirst }), [focusElement, focusFirst])
}
