import { useCallback, useSyncExternalStore } from "react"
import { useRightPanelOpen } from "./panelFit"

export type RightTab = "edit" | "ai"

let current: RightTab = "ai"
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setRightPanelTab(next: RightTab) {
  if (next === current) return
  current = next
  for (const listener of listeners) listener()
}

export function useRightPanelTab(): [RightTab, (next: RightTab) => void] {
  return [useSyncExternalStore(subscribe, () => current, () => "ai" as const), setRightPanelTab]
}

export function useOpenHumanPanel() {
  const [open, setOpen] = useRightPanelOpen()
  return useCallback(() => {
    setRightPanelTab("edit")
    if (!open) setOpen(true)
  }, [open, setOpen])
}
