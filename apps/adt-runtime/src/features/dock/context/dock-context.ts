import { createContext, useContext, type RefObject } from "react"
import type { ReaderButtonStyle } from "@adt/types/reader-ui"

export type DockSide = "top" | "bottom" | "left" | "right"

export interface DockContextValue {
  ref: RefObject<HTMLDivElement | null>
  /** Which way popovers and tooltips open from the dock: away from its edge. */
  popoverSide: DockSide,
  isCompact: boolean,
  isTop: boolean,
  shouldHide: boolean
  isSpread: boolean
  /** The dock is a vertical rail on the left or right edge (desktop only). */
  isVertical: boolean
  /** The edge the dock is attached to, after the mobile fallback. */
  edge: DockSide
  /** Icon, icon + name, or name — from the reader design; phones always get icons. */
  buttonStyle: ReaderButtonStyle
}

export const DockContext = createContext<DockContextValue | null>(null)

export function useDockContext(): DockContextValue {
  const ctx = useContext(DockContext)
  if (!ctx) {
    throw new Error("useDockContext must be used inside <Dock>")
  }
  return ctx
}
