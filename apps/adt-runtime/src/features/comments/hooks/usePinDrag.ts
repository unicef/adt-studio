import { useSetAtom } from "jotai"
import { useCallback, useEffect, useRef } from "react"
import { anchorFromPoint, contentRoot, elementAtPoint } from "@/features/comments/lib/anchor"
import type { CommentAnchor } from "@/features/comments/lib/anchor"
import { pinDragAtom } from "@/features/comments/state/comments.atoms"

/** Mouse: past this many pixels the gesture is a drag, not a click. */
const MOVE_THRESHOLD = 4

/** Touch: a press this long lifts the pin. Shorter is a tap (open the thread),
 *  and moving before it fires is the reviewer scrolling the page. */
const LONG_PRESS_MS = 400

const LONG_PRESS_SLOP = 10

export interface UsePinDragOptions {
  /** A `null` anchor means the pin was dropped where nothing can hold it. */
  onDrop: (id: string, anchor: CommentAnchor | null) => void
}

export interface PinDragHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
}

export interface PinDragControls {
  handlersFor: (id: string) => PinDragHandlers
  /** True for the gesture that just ended, so the pin can swallow its click. */
  consumeSuppressedClick: () => boolean
}

interface Gesture {
  id: string
  pointerId: number
  origin: { x: number; y: number }
  lifted: boolean
  timer: number | null
  element: HTMLElement
  detach: () => void
}

/**
 * Pointer-drag re-anchoring for the reviewer's own pins.
 *
 * One pointer path covers mouse, pen and touch, which is why this is hand-rolled
 * on pointer events rather than the DOM drag-and-drop the activities use: HTML5
 * drag never fires on touch, and a reviewer on a phone is the common case for
 * this feature. The pin is only *lifted* after a threshold (movement for a
 * mouse, a long press for a finger) so the click that opens a thread and the
 * drag that moves it can share the same 28px target.
 *
 * Window listeners are bound on pointerdown rather than in an effect: the
 * gesture lives in a ref (a re-render per pointer event would be wasteful), and
 * an effect keyed off a ref would attach them a frame too late to see the
 * movement that decides whether this is a drag at all.
 */
export function usePinDrag({ onDrop }: UsePinDragOptions): PinDragControls {
  const setDrag = useSetAtom(pinDragAtom)

  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const frame = useRef<number | null>(null)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  const endGesture = useCallback(() => {
    const current = gesture.current
    gesture.current = null
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    if (!current) return
    if (current.timer !== null) window.clearTimeout(current.timer)
    try {
      current.element.releasePointerCapture(current.pointerId)
    } catch {
      /* the pointer may already be gone — releasing twice must not throw */
    }
    current.detach()
  }, [])

  const lift = useCallback(
    (point: { x: number; y: number }) => {
      const current = gesture.current
      if (!current || current.lifted) return
      current.lifted = true
      if (current.timer !== null) {
        window.clearTimeout(current.timer)
        current.timer = null
      }
      try {
        current.element.setPointerCapture(current.pointerId)
      } catch {
        /* capture is an optimisation; the window listeners still fire */
      }
      setDrag({ id: current.id, point, valid: isOverContent(point) })
    },
    [setDrag],
  )

  const cancel = useCallback(() => {
    if (gesture.current?.lifted) suppressClick.current = true
    endGesture()
    setDrag(null)
  }, [endGesture, setDrag])

  const handlersFor = useCallback(
    (id: string): PinDragHandlers => ({
      onPointerDown: (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return
        endGesture()

        const element = event.currentTarget
        const origin = { x: event.clientX, y: event.clientY }
        const pointerId = event.pointerId

        const onPointerMove = (moveEvent: PointerEvent) => {
          const current = gesture.current
          if (!current || moveEvent.pointerId !== current.pointerId) return
          const point = { x: moveEvent.clientX, y: moveEvent.clientY }

          if (!current.lifted) {
            const travelled = Math.hypot(point.x - origin.x, point.y - origin.y)
            if (moveEvent.pointerType === "touch") {
              if (travelled > LONG_PRESS_SLOP) endGesture()
              return
            }
            if (travelled > MOVE_THRESHOLD) lift(point)
            return
          }

          moveEvent.preventDefault()
          if (frame.current !== null) return
          frame.current = requestAnimationFrame(() => {
            frame.current = null
            setDrag((previous) =>
              previous ? { ...previous, point, valid: isOverContent(point) } : previous,
            )
          })
        }

        const onPointerUp = (upEvent: PointerEvent) => {
          const current = gesture.current
          if (!current || upEvent.pointerId !== current.pointerId) return
          if (!current.lifted) {
            endGesture()
            return
          }
          const point = { x: upEvent.clientX, y: upEvent.clientY }
          suppressClick.current = true
          endGesture()
          onDropRef.current(id, anchorFromPoint(point.x, point.y))
        }

        const onKeyDown = (keyEvent: KeyboardEvent) => {
          if (keyEvent.key !== "Escape" || !gesture.current?.lifted) return
          keyEvent.preventDefault()
          keyEvent.stopPropagation()
          cancel()
        }

        const detach = () => {
          window.removeEventListener("pointermove", onPointerMove)
          window.removeEventListener("pointerup", onPointerUp)
          window.removeEventListener("pointercancel", cancel)
          window.removeEventListener("keydown", onKeyDown, true)
        }

        window.addEventListener("pointermove", onPointerMove, { passive: false })
        window.addEventListener("pointerup", onPointerUp)
        window.addEventListener("pointercancel", cancel)
        window.addEventListener("keydown", onKeyDown, true)

        gesture.current = {
          id,
          pointerId,
          origin,
          lifted: false,
          timer:
            event.pointerType === "touch"
              ? window.setTimeout(() => lift(origin), LONG_PRESS_MS)
              : null,
          element,
          detach,
        }
      },
    }),
    [cancel, endGesture, lift, setDrag],
  )

  useEffect(() => endGesture, [endGesture])

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClick.current) return false
    suppressClick.current = false
    return true
  }, [])

  return { handlersFor, consumeSuppressedClick }
}

function isOverContent(point: { x: number; y: number }): boolean {
  const root = contentRoot()
  return root ? elementAtPoint(point.x, point.y, root) !== null : false
}
