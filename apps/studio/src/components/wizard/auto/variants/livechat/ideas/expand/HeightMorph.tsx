import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import "./expand.css"

/**
 * b10 · Family-style height morph: the card stays where it is and only its height eases to whatever
 * its content is now; the content itself swaps with a short blur (`ix-swap`, keyed by the caller).
 */
export function HeightMorph({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className={cn("ix-morph", className)} style={{ height: height ?? undefined }}>
      <div ref={inner}>{children}</div>
    </div>
  )
}

/** b10: which page of the ready card is showing: the setup with name and Create, or the settings to change. */
export type ReadyView = { view: "main" | "change"; setView: (v: "main" | "change") => void }
export const ReadyViewContext = createContext<ReadyView | null>(null)
export const useReadyView = () => useContext(ReadyViewContext)
