import { useState } from "react"

// These are sidebar preferences, not properties of the selected HTML element.
// Persist them across selection, page changes and panel unmounts without keeping
// the element's class editor or inspection data alive.
export function useStyleSectionOpen(section: "inline" | "tailwind" | "computed", defaultOpen: boolean) {
  const key = `adt.pipeline.styles.${section}-open`
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === "true" ? true : saved === "false" ? false : defaultOpen
    } catch { return defaultOpen }
  })
  function changeOpen(value: boolean) {
    setOpen(value)
    try { localStorage.setItem(key, String(value)) } catch { /* Storage can be unavailable. */ }
  }
  return [open, changeOpen] as const
}
