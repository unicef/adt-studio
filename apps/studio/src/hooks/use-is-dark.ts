import { useSyncExternalStore } from "react"

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark")
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
