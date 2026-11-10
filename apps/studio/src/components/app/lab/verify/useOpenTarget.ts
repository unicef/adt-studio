import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { setThemeMode } from "@/lib/theme"
import { TEST_BOOKS } from "../testPlan/tests"
import { applyStageState, clearStageState, type StageStates } from "../stageStates"
import type { TestingTarget } from "./verifyLog"

export function useOpenTarget(stage: string, stageStates: StageStates | null) {
  const navigate = useNavigate()
  return useCallback(
    (target: TestingTarget) => {
      if (target.kind === "page" || target.kind === "grid") {
        clearStageState()
        const book = target.book ?? TEST_BOOKS.done
        const withState = target.kind === "page" ? stageStates?.byPage[stage]?.find((candidate) => candidate.id === target.stateId) : undefined
        void navigate({
          to: "/pipeline/$label/$step",
          params: { label: book, step: stage },
          search: (prev) => ({ ...prev, page: target.kind === "page" ? target.pageId : undefined }),
        }).then(() => {
          if (withState) applyStageState(stage, withState)
        })
        return
      }
      if (target.theme) setThemeMode(target.theme)
      const state = stageStates?.byPage[stage]?.find((candidate) => candidate.id === target.stateId)
      if (state) applyStageState(stage, state)
    },
    [navigate, stage, stageStates],
  )
}
