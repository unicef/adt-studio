import { useEffect, useRef, useState } from "react"

const FOLLOW_THRESHOLD = 56

/**
 * Keeps a scroll viewport pinned to its end while the reader is already there.
 * Pinning is instant on purpose: the rail is resizable, so an animated scroll
 * would restart against a moving target on every reflow and visibly bounce.
 */
export function useStickToBottom() {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const following = useRef(true)
  const programmatic = useRef(false)

  useEffect(() => {
    const content = viewport?.firstElementChild
    if (!viewport || !content) return

    let frame = 0

    const pin = () => {
      programmatic.current = true
      viewport.scrollTop = viewport.scrollHeight
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        programmatic.current = false
      })
    }

    // A scroll event raised by `pin` itself must not be read as the reader
    // leaving the end: growing content can land the event after the next
    // reflow, which would measure a distance and stop the following for good.
    const onScroll = () => {
      if (programmatic.current) return
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      following.current = distance <= FOLLOW_THRESHOLD
    }

    viewport.addEventListener("scroll", onScroll, { passive: true })

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (following.current) pin()
          })
    observer?.observe(content)
    observer?.observe(viewport)

    pin()

    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener("scroll", onScroll)
      observer?.disconnect()
    }
  }, [viewport])

  return setViewport
}
