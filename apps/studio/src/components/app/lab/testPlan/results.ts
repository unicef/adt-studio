import "../frame"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { resetVariants, setVariantValue, type VariantKey } from "../variants"
import { startScenario } from "../simulate"
import { clearAddedOutputs, clearNeedsDismissed } from "../outputs"
import type { LabTest } from "./tests"

interface LabResults {
  activeTest: string | null
}

const store = createPersistentStore<LabResults>(
  "adt.lab.results",
  { activeTest: null },
  (value): value is LabResults => typeof value === "object" && value !== null && "activeTest" in value,
)

export const getLabResults = store.get

export function setActiveTest(testId: string | null) {
  store.set((previous) => ({ ...previous, activeTest: testId }))
}

export function setUpTest(test: LabTest, navigate: (path: string) => void) {
  resetVariants()
  for (const [group, value] of Object.entries(test.variants)) setVariantValue(group as VariantKey, value)
  startScenario(test.sim ? (test.sim.kind === "slow-load" ? test.sim : { ...test.sim, startedAt: Date.now() }) : null)
  if (test.freshOutputs) {
    clearAddedOutputs()
    clearNeedsDismissed()
  }
  setActiveTest(test.id)
  if (test.reload) window.location.assign(test.path)
  else navigate(test.path)
}
