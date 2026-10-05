import { useHotkey } from "@tanstack/react-hotkeys"

function overlayOpen(): boolean {
  return (
    document.querySelector(
      "[role='dialog'][data-state='open'], [role='menu'][data-state='open'], [data-radix-popper-content-wrapper]",
    ) !== null
  )
}

export function usePageDetailKeys({
  enabled,
  prevPageId,
  nextPageId,
  onStep,
}: {
  enabled: boolean
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
}): void {
  const step = (pageId: string | null) => {
    if (!pageId || overlayOpen()) return
    onStep(pageId)
  }

  useHotkey("ArrowLeft", () => step(prevPageId), { enabled })
  useHotkey("ArrowRight", () => step(nextPageId), { enabled })
}
