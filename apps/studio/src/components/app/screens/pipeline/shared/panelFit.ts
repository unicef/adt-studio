import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from "react"
import { useAiPanelOpen } from "@/hooks/use-ai-panel"
import { useSideRailOpen } from "@/hooks/use-side-rail"
import { fitPanels, panelWidths } from "./panelLayout"

type Panel = "rail" | "ai"

let fitted: Record<Panel, boolean> = { rail: false, ai: false }
const listeners = new Set<() => void>()

function setFitted(next: Partial<Record<Panel, boolean>>) {
  const merged = { ...fitted, ...next }
  if (merged.rail === fitted.rail && merged.ai === fitted.ai) return
  fitted = merged
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function useFitted(panel: Panel): boolean {
  return useSyncExternalStore(subscribe, () => fitted[panel], () => false)
}

export function usePanelFit(ref: RefObject<HTMLElement | null>) {
  const [railStored] = useSideRailOpen()
  const railStoredRef = useRef(railStored)
  const evaluate = useRef<() => void>(() => {})

  useEffect(() => {
    const node = ref.current
    if (!node) return
    let narrowAi = false
    let narrowRail = false
    let width = node.clientWidth
    const run = () => {
      const { ai, rail } = fitPanels(width, panelWidths(window.innerWidth), railStoredRef.current)
      if (ai !== narrowAi) setFitted({ ai })
      if (rail !== narrowRail) setFitted({ rail })
      narrowAi = ai
      narrowRail = rail
    }
    evaluate.current = run
    const observer = new ResizeObserver(([entry]) => {
      width = entry?.contentRect.width ?? node.clientWidth
      run()
    })
    observer.observe(node)
    return () => {
      evaluate.current = () => {}
      observer.disconnect()
      setFitted({ rail: false, ai: false })
    }
  }, [ref])

  useEffect(() => {
    railStoredRef.current = railStored
    evaluate.current()
  }, [railStored])
}

function usePanelOpen(panel: Panel, [stored, setStored]: readonly [boolean, (open: boolean) => void]): [boolean, (open: boolean) => void] {
  const hiddenToFit = useFitted(panel)
  const setOpen = useCallback(
    (open: boolean) => {
      setFitted({ [panel]: false })
      setStored(open)
    },
    [panel, setStored],
  )
  return [stored && !hiddenToFit, setOpen]
}

export function useRailOpen() {
  return usePanelOpen("rail", useSideRailOpen())
}

export function useRightPanelOpen() {
  return usePanelOpen("ai", useAiPanelOpen())
}

export function focusPanelToggle(name: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target = [...document.querySelectorAll<HTMLElement>(`[data-panel-toggle="${name}"]`)].find(
        (element) => !element.closest("[inert]") && element.getClientRects().length > 0,
      )
      target?.focus()
    }),
  )
}
