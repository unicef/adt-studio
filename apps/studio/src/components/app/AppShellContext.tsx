import { createContext, useContext } from "react"

export interface AppShellValue {
  openAdd: () => void
  requestDelete: (label: string) => void
}

export const AppShellContext = createContext<AppShellValue>({
  openAdd: () => {},
  requestDelete: () => {},
})

export function useAppShell() {
  return useContext(AppShellContext)
}
