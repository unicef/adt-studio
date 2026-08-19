import { useEffect } from "react"
import { useLocation } from "@tanstack/react-router"

const FLASH_CLASSES = ["ring-2", "ring-brand-400", "ring-offset-4", "ring-offset-background", "rounded-xl"]
const FLASH_MS = 1600
const MAX_FRAMES = 30

export function useSettingsAnchor() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (!hash) return

    let frame = 0
    let attempts = 0
    let timeout = 0
    let target: HTMLElement | null = null

    const reveal = () => {
      target = document.getElementById(hash)
      if (!target) {
        attempts += 1
        if (attempts < MAX_FRAMES) frame = requestAnimationFrame(reveal)
        return
      }
      // eslint-disable-next-line lingui/no-unlocalized-strings -- media query, not UI copy
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })
      target.classList.add(...FLASH_CLASSES)
      timeout = window.setTimeout(() => target?.classList.remove(...FLASH_CLASSES), FLASH_MS)
    }

    frame = requestAnimationFrame(reveal)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      target?.classList.remove(...FLASH_CLASSES)
    }
  }, [pathname, hash])
}
