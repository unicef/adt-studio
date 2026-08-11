import { useEffect, useState } from "react"

function readIsDark(): boolean {
  if (typeof document !== "undefined") {
    if (document.documentElement.classList.contains("dark")) return true
    if (document.querySelector(".dark")) return true
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    /* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query */
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  }
  return false
}

/**
 * Whether the app is currently rendering in dark mode. Dark mode is class-based
 * (`.dark`); when no class is present we defer to the OS color scheme. Reacts to
 * both the class toggling and the OS preference changing.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(readIsDark)

  useEffect(() => {
    const update = () => setIsDark(readIsDark())
    update()

    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    /* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query */
    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    media?.addEventListener("change", update)

    return () => {
      observer.disconnect()
      media?.removeEventListener("change", update)
    }
  }, [])

  return isDark
}
