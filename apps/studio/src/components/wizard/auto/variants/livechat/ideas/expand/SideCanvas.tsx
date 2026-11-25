import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Trans } from "@lingui/react/macro"
import { X } from "lucide-react"
import { useReducedEffects } from "@/lib/effects"
import "./expand.css"

/** b9: where the thread keeps its side canvas, and how a message tells it that it's open. */
export type CanvasSlot = { el: HTMLElement | null; setOpen: (open: boolean) => void }
export const CanvasContext = createContext<CanvasSlot | null>(null)
export const useCanvasSlot = () => useContext(CanvasContext)

/** The width the thread gives up while the canvas is open. */
export const CANVAS_WIDTH = 440

/**
 * b9 · Side canvas that peels off a message: the content grows out of its bubble into a panel at the
 * right of the thread (the thread slides left to make room) and folds back into the bubble when closed.
 */
export function SideCanvas({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const slot = useCanvasSlot()
  const reduced = useReducedEffects()
  const [shown, setShown] = useState(open)
  const closing = shown && !open
  useEffect(() => {
    if (open) setShown(true)
    else if (shown) {
      const id = window.setTimeout(() => setShown(false), reduced ? 0 : 320)
      return () => window.clearTimeout(id)
    }
  }, [open])
  useEffect(() => {
    slot?.setOpen(open)
  }, [open])
  useEffect(() => () => slot?.setOpen(false), [])
  if (!slot?.el || !shown) return null
  return createPortal(
    <aside data-closing={closing} className="ix-canvas lc-surface pointer-events-auto flex h-full w-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        <button type="button" onClick={onClose} className="lc-link inline-flex h-9 items-center gap-1.5 px-3 text-[13.5px] font-medium">
          <X className="size-3.5" />
          <Trans>Done</Trans>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </aside>,
    slot.el,
  )
}
