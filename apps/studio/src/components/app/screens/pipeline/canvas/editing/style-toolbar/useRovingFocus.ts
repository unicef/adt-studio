import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from "react"

const ITEM = "[data-toolbar-item]"

function itemsIn(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>(ITEM)].filter((item) => !item.closest("[data-slot-hidden]")) : []
}

export function nextRovingIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null
  if (key === "ArrowRight") return (index + 1) % count
  if (key === "ArrowLeft") return (index - 1 + count) % count
  if (key === "Home") return 0
  if (key === "End") return count - 1
  return null
}

export function useRovingFocus(ref: RefObject<HTMLElement | null>) {
  const active = useRef(0)

  useLayoutEffect(() => {
    const items = itemsIn(ref.current)
    const current = Math.min(active.current, Math.max(0, items.length - 1))
    items.forEach((item, index) => {
      item.tabIndex = index === current ? 0 : -1
    })
  })

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const items = itemsIn(ref.current)
    const index = items.indexOf(event.target as HTMLElement)
    if (index < 0) return
    active.current = index
    items.forEach((item, position) => {
      item.tabIndex = position === index ? 0 : -1
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!ref.current?.contains(event.target as Node)) return
    const items = itemsIn(ref.current)
    const index = items.indexOf(event.target as HTMLElement)
    const next = nextRovingIndex(event.key, Math.max(0, index), items.length)
    if (next === null) return
    event.preventDefault()
    items[next]?.focus()
  }

  return { onFocus, onKeyDown }
}
