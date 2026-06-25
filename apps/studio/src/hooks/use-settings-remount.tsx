import { createContext, useContext } from "react"

const SettingsRemountContext = createContext<() => void>(() => {})

export const SettingsRemountProvider = SettingsRemountContext.Provider

export function useSettingsRemount(): () => void {
  return useContext(SettingsRemountContext)
}
