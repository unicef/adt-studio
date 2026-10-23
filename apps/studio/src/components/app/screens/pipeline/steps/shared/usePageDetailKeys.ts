import { useHotkey } from "@tanstack/react-hotkeys"

export function overlayOpen(): boolean {
  return (
    document.querySelector(
      "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open'], [role='menu'][data-state='open'], [role='listbox'][data-state='open'], [data-radix-popper-content-wrapper], [data-radix-select-viewport]",
    ) !== null
  )
}

function typing(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  return active.isContentEditable || active.matches("input, textarea, select")
}

export function usePageDetailKeys({
  enabled,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
}: {
  enabled: boolean
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose?: () => void
}): void {
  const step = (event: KeyboardEvent, pageId: string | null) => {
    if (!pageId || event.defaultPrevented || overlayOpen()) return
    event.preventDefault()
    onStep(pageId)
  }

  const close = (event: KeyboardEvent) => {
    if (!onClose || event.defaultPrevented || overlayOpen() || typing()) return
    onClose()
  }

  const passive = { preventDefault: false, stopPropagation: false } as const
  useHotkey("ArrowLeft", (event) => step(event, prevPageId), { enabled, ...passive })
  useHotkey("ArrowRight", (event) => step(event, nextPageId), { enabled, ...passive })
  useHotkey("Escape", close, { enabled: enabled && !!onClose, ignoreInputs: true, ...passive })
}
