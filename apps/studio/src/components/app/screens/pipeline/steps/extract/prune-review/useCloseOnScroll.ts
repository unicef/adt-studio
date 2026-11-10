import { useEffect } from "react"

const QUIET_MS = 450
let lastScroll = 0
let movedSinceScroll = true
let installed = false

function install() {
  if (installed || typeof document === "undefined") return
  installed = true
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-radix-popper-content-wrapper]")) return
      lastScroll = performance.now()
      movedSinceScroll = false
    },
    { capture: true, passive: true },
  )
  document.addEventListener(
    "wheel",
    () => {
      lastScroll = performance.now()
      movedSinceScroll = false
    },
    { capture: true, passive: true },
  )
  let lastX = -1
  let lastY = -1
  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.clientX === lastX && event.clientY === lastY) return
      lastX = event.clientX
      lastY = event.clientY
      if (performance.now() - lastScroll > 60) movedSinceScroll = true
    },
    { capture: true, passive: true },
  )
}

export function hoverAllowed(): boolean {
  install()
  return movedSinceScroll && performance.now() - lastScroll > QUIET_MS
}

export function useCloseOnScroll(open: boolean, close: () => void) {
  useEffect(() => {
    install()
    if (!open) return
    const onScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-radix-popper-content-wrapper]")) return
      close()
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    document.addEventListener("wheel", onScroll, { capture: true, passive: true })
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("wheel", onScroll, { capture: true })
      window.removeEventListener("resize", close)
    }
  }, [open, close])
}
