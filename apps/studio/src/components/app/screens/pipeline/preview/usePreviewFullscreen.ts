import { useEffect, useState } from "react"

export function usePreviewFullscreen() {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [fullscreen])

  return {
    fullscreen,
    enter: () => setFullscreen(true),
    exit: () => setFullscreen(false),
  }
}
