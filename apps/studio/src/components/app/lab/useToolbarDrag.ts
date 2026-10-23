import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"
import { createPersistentStore, type PersistentStore } from "@/hooks/create-persistent-store"

type Anchor = "left" | "right"

interface ToolbarOffset {
  x: number
  bottom: number
}

const MARGIN = 8
const DRAG_THRESHOLD = 4
const NUDGE = 16

const stores = new Map<string, PersistentStore<ToolbarOffset | null>>()

function storeFor(key: string) {
  let store = stores.get(key)
  if (!store) {
    store = createPersistentStore<ToolbarOffset | null>(
      key,
      null,
      (value): value is ToolbarOffset | null =>
        value === null ||
        (typeof value === "object" && typeof (value as ToolbarOffset).x === "number" && typeof (value as ToolbarOffset).bottom === "number"),
    )
    stores.set(key, store)
  }
  return store
}

function measure(element: HTMLElement, anchor: Anchor): ToolbarOffset {
  const rect = element.getBoundingClientRect()
  return {
    x: anchor === "left" ? rect.left : window.innerWidth - rect.right,
    bottom: window.innerHeight - rect.bottom,
  }
}

function clamp(offset: ToolbarOffset, element: HTMLElement | null): ToolbarOffset {
  const width = element?.offsetWidth ?? 0
  const height = element?.offsetHeight ?? 0
  return {
    x: Math.round(Math.min(Math.max(offset.x, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN))),
    bottom: Math.round(Math.min(Math.max(offset.bottom, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN))),
  }
}

export function useToolbarDrag(target: RefObject<HTMLElement | null>, storageKey: string, anchor: Anchor) {
  const store = storeFor(storageKey)
  const [offset, setOffset] = store.use()
  const [dragging, setDragging] = useState(false)
  const moved = useRef(false)
  const direction = anchor === "left" ? 1 : -1

  useEffect(() => {
    const element = target.current
    const onResize = () =>
      setOffset((current) => {
        if (!current) return current
        const next = clamp(current, target.current)
        return next.x === current.x && next.bottom === current.bottom ? current : next
      })
    onResize()
    window.addEventListener("resize", onResize)
    const observer = typeof ResizeObserver === "undefined" || !element ? null : new ResizeObserver(onResize)
    if (element) observer?.observe(element)
    return () => {
      window.removeEventListener("resize", onResize)
      observer?.disconnect()
    }
  })

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !target.current) return
      event.preventDefault()
      const handle = event.currentTarget
      const pointerId = event.pointerId
      const startX = event.clientX
      const startY = event.clientY
      const start = measure(target.current, anchor)
      moved.current = false

      const onMove = (move: PointerEvent) => {
        const dx = move.clientX - startX
        const dy = move.clientY - startY
        if (!moved.current) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          moved.current = true
          setDragging(true)
          handle.setPointerCapture(pointerId)
        }
        setOffset(clamp({ x: start.x + dx * direction, bottom: start.bottom - dy }, target.current))
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
        setDragging(false)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
    },
    [anchor, direction, setOffset, target],
  )

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!moved.current) return
    moved.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? NUDGE * 4 : NUDGE
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const delta = deltas[event.key]
      if (!delta || !target.current) return
      event.preventDefault()
      event.stopPropagation()
      const start = measure(target.current, anchor)
      setOffset(clamp({ x: start.x + delta[0] * direction, bottom: start.bottom - delta[1] }, target.current))
    },
    [anchor, direction, setOffset, target],
  )

  const reset = useCallback(() => setOffset(null), [setOffset])

  const style: CSSProperties | undefined = offset ? { [anchor]: offset.x, bottom: offset.bottom } : undefined

  return {
    style,
    dragging,
    handleProps: { onPointerDown, onClickCapture },
    gripProps: { onKeyDown, onDoubleClick: reset },
  }
}
