import { useEffect } from "react"
import { msg } from "@lingui/core/macro"
import { useRouter } from "@tanstack/react-router"
import { setUpTest } from "./testPlan/results"
import { applyState, clearActiveState, statesFor } from "./testPlan/states"
import { LAB_TESTS, type LabState, type LabTest } from "./testPlan/tests"
import { IN_LAB_FRAME } from "./frame"

const TEST_PARAM = "lab-test"
const STATE_PARAM = "lab-state"
const SCENARIO_PARAM = "lab-scenario"

type FrameScenario = Omit<LabState, "id" | "label" | "hint">

function frameScenario(params: URLSearchParams): FrameScenario | null {
  if (!IN_LAB_FRAME) return null
  try {
    return JSON.parse(params.get(SCENARIO_PARAM) ?? "null") as FrameScenario | null
  } catch {
    return null
  }
}

export function useLabDeepLink() {
  const router = useRouter()
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const scenario = frameScenario(params)
    if (scenario) {
      const variants = JSON.parse(params.get("lab-v") || "{}") as LabTest["variants"]
      const path = window.location.pathname
      const test: LabTest = {
        id: "canvas-frame",
        group: "features",
        title: msg`Canvas preview`,
        changes: msg`Canvas preview`,
        variants,
        freshOutputs: true,
        path,
        steps: [],
        lookFor: [],
        compare: msg`Canvas preview`,
      }
      applyState(test, { ...scenario, id: "canvas", label: msg`Canvas preview`, path }, (next) => router.history.replace(next), true, variants)
      return
    }
    const testId = params.get(TEST_PARAM)
    if (!testId) return
    const test = LAB_TESTS.find((candidate) => candidate.id === testId)
    if (!test) return
    const stateId = params.get(STATE_PARAM)
    const states = statesFor(test)
    const state = states.find((candidate) => candidate.id === stateId) ?? states[0]
    const navigate = (path: string) => router.history.replace(path)
    const variants = IN_LAB_FRAME ? (JSON.parse(params.get("lab-v") || "{}") as LabTest["variants"]) : test.variants
    if (state) applyState(test, state, navigate, true, variants)
    else {
      clearActiveState()
      setUpTest({ ...test, variants }, navigate)
    }
  }, [router])
}
