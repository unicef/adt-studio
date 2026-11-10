import { useEffect, useState } from "react"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { clearAddedOutputs, clearNeedsDismissed, setNeedsDismissedFor, setOutputsFor } from "./outputs"
import { setBookSim } from "./bookSim"
import { startScenario, stopScenario, type Scenario } from "./simulate"
import { setVariantValue, type VariantKey } from "./variants"
import { statesFor } from "./testPlan/states"
import { LAB_TESTS, TEST_BOOKS, type LabSim, type LabState } from "./testPlan/tests"

export interface StageState {
  id: string
  kind: string
  label: string
  path: string
  test?: string
  state?: string
  groups?: string[]
  variants?: Record<string, string>
  scenario?: Omit<LabState, "id" | "label" | "hint" | "path" | "reload"> & { sim: LabSim | null }
}

interface FlowModule {
  PAGE_STATES: Record<string, StageState[]>
  KIND_LABELS: Record<string, string>
}

export interface StageStates {
  byPage: Record<string, StageState[]>
  kinds: Record<string, string>
}

const loaders = import.meta.glob<FlowModule>("/src/components/app/lab/canvas/flowMap.ts")

let cached: StageStates | null = null

export function useStageStates(): StageStates | null {
  const [value, setValue] = useState<StageStates | null>(cached)
  useEffect(() => {
    if (cached) return
    const load = Object.values(loaders)[0]
    if (!load) return
    void load().then((module) => {
      cached = { byPage: module.PAGE_STATES, kinds: module.KIND_LABELS }
      setValue(cached)
    })
  }, [])
  return value
}

export function pageKeyFor(pathname: string): string | null {
  if (pathname === "/") return "home"
  const match = pathname.match(/^\/pipeline\/[^/]+(?:\/([^/]+))?(?:\/([^/]+))?/)
  if (!match) return null
  const [, segment, next] = match
  if (!segment || segment === "pages") return "storyboard"
  if (segment === "settings" || segment === "info") return null
  return next === "settings" ? [segment, "settings"].join("-") : segment
}

interface ActiveStageState {
  page: string
  id: string
}

const activeStore = createPersistentStore<ActiveStageState | null>(
  "adt.lab.stage-state",
  null,
  (value): value is ActiveStageState | null => value === null || (typeof value === "object" && value !== null && "id" in value && "page" in value),
)

export const useActiveStageState = activeStore.use

function resolve(state: StageState): LabState {
  if (state.test) {
    const test = LAB_TESTS.find((candidate) => candidate.id === state.test)
    const found = statesFor(test).find((candidate) => candidate.id === state.state)
    if (test && found) return { ...found, sim: found.sim === undefined ? test.sim : found.sim, path: state.path }
  }
  return { id: state.id, label: { id: state.id }, path: state.path, ...(state.scenario ?? { sim: null }) }
}

function currentBook(): string | null {
  const [, root, book] = window.location.pathname.split("/")
  return root === "pipeline" && book ? decodeURIComponent(book) : null
}

function rebind<T>(sim: T, book: string | null): T {
  if (!book || !sim || typeof sim !== "object" || !("book" in sim)) return sim
  return { ...sim, book }
}

export function applyStageState(page: string, state: StageState) {
  const lab = resolve(state)
  const inPlace = pageKeyFor(window.location.pathname) === page && lab.sim?.kind !== "slow-load" && !lab.reload
  const book = inPlace ? currentBook() : null
  const sim = rebind(lab.sim ?? null, book)
  const now = Date.now()
  clearAddedOutputs()
  clearNeedsDismissed()
  setBookSim("real")
  setVariantValue("sbsim", "real")
  setVariantValue("exbstate", state.variants?.exbstate ?? "real")
  for (const [key, value] of Object.entries(state.variants ?? {})) if (key !== "exbstate") setVariantValue(key as VariantKey, value)
  if (!sim) stopScenario()
  else if (sim.kind === "slow-load") startScenario(sim as Scenario)
  else {
    const runs = sim.kind === "journey" && lab.runsAgo ? Object.fromEntries(Object.entries(lab.runsAgo).map(([stage, ago]) => [stage, now - ago])) : undefined
    const frozen = !lab.play && lab.pauseAtMs === undefined
    startScenario({ ...sim, startedAt: now - (lab.atMs ?? 0), pausedAt: frozen ? now : undefined, pauseAtMs: lab.pauseAtMs, ...(runs ? { runs } : {}) } as Scenario)
  }
  if (lab.outputs) setOutputsFor(book ?? TEST_BOOKS.done, lab.outputs)
  if (lab.needsDismissed !== undefined) setNeedsDismissedFor(book ?? TEST_BOOKS.done, lab.needsDismissed)
  activeStore.set({ page, id: state.id })
  if (!inPlace) window.location.assign(lab.path ?? state.path)
}

export function clearStageState() {
  stopScenario()
  setVariantValue("exbstate", "real")
  activeStore.set(null)
}
