import { createContext, useContext } from "react"

/**
 * How the dock panel around a piece of dock content is presented. Content
 * sizes itself to it: a popover has a fixed card size, a drawer fills its
 * column.
 */
export type DockPanelVariant = "popover" | "drawer"

export const DockPanelVariantContext = createContext<DockPanelVariant>("popover")

export function useDockPanelVariant(): DockPanelVariant {
  return useContext(DockPanelVariantContext)
}
