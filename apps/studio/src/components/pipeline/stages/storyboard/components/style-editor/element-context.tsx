import { createContext, useContext, type ReactNode } from "react"
import type { DeviceView } from "./device-breakpoint"

interface ElementCtx {
  /** data-id of the currently-selected element */
  dataId: string
  /** Tailwind class list, in source order */
  classes: string[]
  /** Persists a new class list back to the element. */
  onClassesChange: (dataId: string, classes: string[]) => void
  /** Persists a single inline CSS property (or removes it when value is empty).
   *  Used for styling that must override class/cascade rules — e.g. the
   *  per-element font, which is applied as an inline `font-family` so it isn't
   *  overridden by the book's body-font rule and needs no Tailwind rebuild. */
  onStyleChange?: (dataId: string, property: string, value: string) => void
  deviceView: DeviceView
  /** Book label, used by the font control to list the book's attached fonts
   *  and attach new Google Fonts inline. */
  bookLabel?: string
  /** Snapshot of the iframe element's getComputedStyle, used as a fallback so
   *  the inspector can show what the element actually renders at when no
   *  explicit class is set (e.g., font-size inherited from a parent). */
  computedStyles?: {
    fontSize?: number | null
    color?: string | null
    fontWeight?: string | null
    lineHeight?: number | null
    textAlign?: string | null
    /** Primary declared font family of the element's text (e.g. "Mouse
     *  Memoirs"), read from the rendered HTML. Display-only. */
    fontFamily?: string | null
    /** Primary family from the element's own inline `style="font-family"`, if
     *  any — lets the font control tell an explicit per-element font from an
     *  inherited one. */
    inlineFontFamily?: string | null
  }
}

const ElementContext = createContext<ElementCtx | null>(null)

interface ElementProviderProps {
  value: ElementCtx
  children: ReactNode
}

export function ElementProvider({ value, children }: ElementProviderProps) {
  return <ElementContext.Provider value={value}>{children}</ElementContext.Provider>
}

export function useElementContext(): ElementCtx {
  const ctx = useContext(ElementContext)
  if (!ctx) {
    throw new Error("useElementContext must be used inside <ElementProvider>")
  }
  return ctx
}

/** Like {@link useElementContext} but returns null instead of throwing when no
 *  provider is present — lets generic controls (e.g. TokenInput) be reused
 *  outside the style-editor sidebar. */
export function useOptionalElementContext(): ElementCtx | null {
  return useContext(ElementContext)
}
