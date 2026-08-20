import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { usePipelineUi } from "@/hooks/use-pipeline-ui"

/** Opening a book lands on its pipeline, in whichever pipeline UI is selected in
 *  Appearance. Shared so every surface that shows a book — home cards, library
 *  rows, search results — agrees on the target. */
export function useOpenBook(): (label: string) => void {
  const navigate = useNavigate()
  const [pipelineUi] = usePipelineUi()
  return useCallback(
    (label: string) => {
      if (pipelineUi === "classic") {
        void navigate({ to: "/books/$label/$step", params: { label, step: "book" } })
        return
      }
      void navigate({ to: "/pipeline/$label", params: { label } })
    },
    [navigate, pipelineUi],
  )
}
