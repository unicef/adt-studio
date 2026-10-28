import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useScenario } from "./simulate"

export function LabScenarioRefresh() {
  const queryClient = useQueryClient()
  const [scenario] = useScenario()
  const key = scenario ? [scenario.kind, "book" in scenario ? scenario.book : "", "startedAt" in scenario ? scenario.startedAt : ""].join("|") : ""
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    void queryClient.invalidateQueries({ queryKey: ["books"] })
  }, [key, queryClient])
  return null
}
