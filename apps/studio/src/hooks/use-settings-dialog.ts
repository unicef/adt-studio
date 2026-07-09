import { createContext, useContext } from "react"

export const SettingsContext = createContext<{ openSettings: () => void }>({
  openSettings: () => {},
})

export function useSettingsDialog() {
  return useContext(SettingsContext)
}
