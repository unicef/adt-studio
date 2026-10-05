import { createContext, useContext } from "react"

const SettingsReturnContext = createContext<(() => void) | null>(null)

export const SettingsReturnProvider = SettingsReturnContext.Provider

export function useSettingsReturn(): (() => void) | null {
  return useContext(SettingsReturnContext)
}
