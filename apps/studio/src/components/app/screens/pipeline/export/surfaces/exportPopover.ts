import { useSyncExternalStore } from "react"

let openFor: string | null = null
const listeners = new Set<() => void>()

function setOpenFor(label: string | null) {
  openFor = label
  for (const listener of listeners) listener()
}

export function openExportPopover(label: string) {
  setOpenFor(label)
}

export function cancelExportPopover(label: string) {
  if (openFor === label) setOpenFor(null)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useExportPopoverOpen(label: string): [boolean, (next: boolean) => void] {
  const open = useSyncExternalStore(subscribe, () => openFor === label)
  return [open, (next) => setOpenFor(next ? label : null)]
}
