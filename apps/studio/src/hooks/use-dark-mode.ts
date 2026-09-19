import { useSyncExternalStore } from "react"

const DARK_CLASS = "dark"

function read() {
  if (typeof document === "undefined") return false
  return document.documentElement.classList.contains(DARK_CLASS)
}

function subscribe(onStoreChange: () => void) {
  if (typeof document === "undefined") return () => {}
  const observer = new MutationObserver(onStoreChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

export function useIsDarkMode() {
  return useSyncExternalStore(subscribe, read, () => false)
}
