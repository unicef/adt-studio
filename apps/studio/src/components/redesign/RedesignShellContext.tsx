import { createContext, useContext } from "react"

export interface RedesignShellValue {
  openAdd: () => void
  requestDelete: (label: string) => void
}

export const RedesignShellContext = createContext<RedesignShellValue>({
  openAdd: () => {},
  requestDelete: () => {},
})

export function useRedesignShell() {
  return useContext(RedesignShellContext)
}
