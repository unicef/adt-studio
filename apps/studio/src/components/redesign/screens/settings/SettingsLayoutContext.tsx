import { createContext, useContext, type ReactNode } from "react"
import type { SettingsLayoutVariant } from "./useSettingsLayoutVariant"

interface SettingsLayoutContextValue {
  layout: SettingsLayoutVariant
}

const SettingsLayoutContext = createContext<SettingsLayoutContextValue>({ layout: "cards" })

export function SettingsLayoutProvider({
  layout,
  children,
}: {
  layout: SettingsLayoutVariant
  children: ReactNode
}) {
  return (
    <SettingsLayoutContext.Provider value={{ layout }}>{children}</SettingsLayoutContext.Provider>
  )
}

export function useSettingsLayout(): SettingsLayoutContextValue {
  return useContext(SettingsLayoutContext)
}
