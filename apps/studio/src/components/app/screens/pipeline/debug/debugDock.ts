import { createContext, useContext } from "react"

export interface PipelineDebugControls {
  open: () => void
}

export const PipelineDebugContext = createContext<PipelineDebugControls | null>(null)

export function usePipelineDebug(): PipelineDebugControls | null {
  return useContext(PipelineDebugContext)
}
