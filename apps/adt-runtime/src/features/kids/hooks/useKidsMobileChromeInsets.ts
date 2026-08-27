import { useLayoutEffect } from "react"

const STYLE_ID = "kids-mobile-chrome-insets"

const MOBILE_CHROME_CSS = `
@media (max-width: 639px) {
  body {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom)) !important;
  }
}
`

/** Keeps mobile book content out from under the fixed Kids Mode controls. */
export function useKidsMobileChromeInsets(active: boolean): void {
  useLayoutEffect(() => {
    const existing = document.getElementById(STYLE_ID)
    if (!active) {
      existing?.remove()
      return
    }

    const style =
      (existing as HTMLStyleElement | null) ??
      document.head.appendChild(
        Object.assign(document.createElement("style"), { id: STYLE_ID }),
      )
    style.textContent = MOBILE_CHROME_CSS
    return () => style.remove()
  }, [active])
}
