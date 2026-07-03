import { createContext, useContext, type ReactNode } from "react"
import type { DeviceView } from "./device-breakpoint"

interface ElementCtx {
  dataId: string
  classes: string[]
  onClassesChange: (dataId: string, classes: string[]) => void
  onLegacyStyleClear?: (dataId: string, property: string) => void
  deviceView: DeviceView
  bookLabel?: string
  computedStyles?: {
    fontSize?: number | null
    color?: string | null
    fontWeight?: string | null
    lineHeight?: number | null
    textAlign?: string | null
    fontFamily?: string | null
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
