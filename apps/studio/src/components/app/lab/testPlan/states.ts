import { IN_LAB_FRAME } from "../frame"
import { msg } from "@lingui/core/macro"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { resetVariants, setVariantValue, type VariantKey } from "../variants"
import { startScenario, stopScenario } from "../simulate"
import { clearAddedOutputs, clearNeedsDismissed, setNeedsDismissedFor, setOutputsFor } from "../outputs"
import { getLabResults, setActiveTest } from "./results"
import { JOURNEY, LAB_TESTS, TEST_BOOKS, type LabState, type LabTest } from "./tests"

const FRESH = TEST_BOOKS.fresh
const DONE = TEST_BOOKS.done
const EXTRACT_MS = 26000
const SECTIONING_MS = 20000
const STORYBOARD_MS = 26000
const SETUP_MS = EXTRACT_MS + SECTIONING_MS + STORYBOARD_MS
const AFTER_SETUP_MS = 100000
const HELD_LOAD = { kind: "slow-load" as const, delayMs: 600000 }

const landingStates: LabState[] = [
  { id: "never-run", label: msg`Never-run stage`, hint: msg`Sectioning on "[Lab] Hyena and Raven"`, path: `/pipeline/${FRESH}/sectioning` },
  { id: "locked", label: msg`Locked stage`, hint: msg`Image Captions before the storyboard exists`, path: `/pipeline/${FRESH}/captions` },
  { id: "has-results", label: msg`Stage with results`, hint: msg`Quizzes on "[Lab] Triste fim…"`, path: `/pipeline/${DONE}/quizzes` },
]

const runStates = (path: string, durationMs: number): LabState[] => [
  { id: "start", label: msg`Just started`, atMs: Math.round(durationMs * 0.06), path },
  { id: "half", label: msg`Halfway`, atMs: Math.round(durationMs * 0.5), path },
  { id: "almost", label: msg`Almost done`, atMs: Math.round(durationMs * 0.93), path },
  { id: "live", label: msg`Live`, hint: msg`Keeps running so you can watch it move`, atMs: 0, play: true, path },
]

const returnStates: LabState[] = [
  { id: "running", label: msg`Captions running · halfway`, atMs: 6000, path: `/pipeline/${DONE}/captions?page=pg008009` },
  { id: "finished", label: msg`Just finished`, hint: msg`Plays the last second so the finish shows`, atMs: 10800, pauseAtMs: 14000, path: `/pipeline/${DONE}/captions?page=pg008009` },
  { id: "back", label: msg`Back on the storyboard`, path: `/pipeline/${DONE}/pages/pg008009`, sim: null },
]

const bootStates: LabState[] = [
  { id: "loading", label: msg`Loading (held)`, hint: msg`Reloads and keeps the loading screen up`, path: `/pipeline/${DONE}/glossary`, sim: HELD_LOAD, reload: true },
  { id: "loaded", label: msg`Loaded`, path: `/pipeline/${DONE}/glossary`, sim: null, reload: true },
]

const AFTER = { atMs: AFTER_SETUP_MS }
const ADDED = ["captions", "translate", "speech"]

const outputStates = (suggested: boolean): LabState[] => [
  {
    id: "nothing",
    label: suggested ? msg`Reader card` : msg`Nothing added`,
    path: `/pipeline/${DONE}/pages/pg008009`,
    outputs: [],
    needsDismissed: false,
    ...AFTER,
  },
  { id: "added", label: msg`Three outputs added, not run`, path: `/pipeline/${DONE}/pages/pg008009`, outputs: ADDED, needsDismissed: true, ...AFTER },
  { id: "never-run", label: msg`An added output · never run`, path: `/pipeline/${DONE}/captions`, outputs: ADDED, needsDismissed: true, ...AFTER },
  {
    id: "running",
    label: msg`An added output · running`,
    path: `/pipeline/${DONE}/captions`,
    outputs: ADDED,
    needsDismissed: true,
    runsAgo: { captions: 5000 },
    ...AFTER,
  },
  {
    id: "finished",
    label: msg`An added output · just finished`,
    hint: msg`Plays the last seconds so the finish shows`,
    path: `/pipeline/${DONE}/captions`,
    outputs: ADDED,
    needsDismissed: true,
    runsAgo: { captions: 9500 },
    atMs: AFTER_SETUP_MS,
    pauseAtMs: AFTER_SETUP_MS + 4500,
  },
]

const setupStates: LabState[] = [
  { id: "extract", label: msg`Extract · 7 of 21`, atMs: 8500, path: `/pipeline/${DONE}/extract` },
  { id: "sectioning", label: msg`Sectioning · 10 of 21`, atMs: EXTRACT_MS + 9500, path: `/pipeline/${DONE}/sectioning` },
  { id: "storyboard", label: msg`Storyboard building · 12 of 21`, atMs: EXTRACT_MS + SECTIONING_MS + 14500, path: `/pipeline/${DONE}/pages/pg001` },
  {
    id: "finishing",
    label: msg`Setup finishing`,
    hint: msg`Plays the last seconds so the bar folds away`,
    atMs: SETUP_MS - 2500,
    pauseAtMs: SETUP_MS + 2000,
    path: `/pipeline/${DONE}/pages/pg001`,
  },
]

const loaderStates: LabState[] = [
  { id: "building", label: msg`Storyboard building`, atMs: EXTRACT_MS + SECTIONING_MS + 5000, path: `/pipeline/${DONE}/pages/pg001` },
  { id: "unbuilt-page", label: msg`An unbuilt page`, hint: msg`Page 8 while early pages build`, atMs: EXTRACT_MS + SECTIONING_MS + 2500, path: `/pipeline/${DONE}/pages/pg008009` },
  { id: "extract", label: msg`Extract streaming`, atMs: 9500, path: `/pipeline/${DONE}/extract` },
  { id: "stage-loading", label: msg`Stage loading (held)`, hint: msg`Reloads and keeps the stage skeleton up`, path: `/pipeline/${DONE}/quizzes`, sim: HELD_LOAD, reload: true },
]

const STATES: Record<string, LabState[]> = {
  "entry-gated": [
    { id: "mid-setup", label: msg`Opening a book mid-setup`, hint: msg`"[Lab] Hyena and Raven" → lands on Sectioning`, path: `/pipeline/${FRESH}` },
    { id: "processed", label: msg`Opening a processed book`, hint: msg`"[Lab] Triste fim…" → storyboard`, path: `/pipeline/${DONE}` },
  ],
  "landing-action-first": landingStates,
  "landing-compact": landingStates,
  "running-extract": runStates(`/pipeline/${DONE}/extract`, 40000),
  "running-captions": runStates(`/pipeline/${FRESH}/captions`, 30000),
  "running-hub": runStates(`/pipeline/${FRESH}`, 30000),
  "running-validation": runStates(`/pipeline/${DONE}/validation`, 30000),
  "return-banner": returnStates,
  "return-toast": returnStates,
  ai: [
    { id: "page", label: msg`Storyboard · page 8`, path: `/pipeline/${DONE}/pages/pg008009` },
    { id: "stage", label: msg`A stage page`, hint: msg`Image Captions`, path: `/pipeline/${DONE}/captions` },
  ],
  boot: bootStates,
  "boot-splash": bootStates,
  export: [
    { id: "preview", label: msg`Preview`, path: `/pipeline/${DONE}/preview` },
    { id: "export", label: msg`Export screen`, path: `/pipeline/${DONE}/export` },
  ],
  "features-add": outputStates(false),
  "features-suggested": outputStates(true),
  "loaders-content": loaderStates,
  "flow-journey": setupStates,
  "flow-today": setupStates,
  "flow-outputs": outputStates(true),
  "flow-loaders": loaderStates,
}

export function statesFor(test: LabTest | undefined): LabState[] {
  return test ? (test.states ?? STATES[test.id] ?? []) : []
}

export interface ActiveState {
  testId: string
  stateId: string
}

const activeStore = createPersistentStore<ActiveState | null>(
  "adt.lab.state",
  null,
  (value): value is ActiveState | null => value === null || (typeof value === "object" && value !== null && "stateId" in value),
)

export const useActiveState = activeStore.use

export function clearActiveState() {
  activeStore.set(null)
}

function applyVariants(variants: Partial<Record<VariantKey, string>>) {
  resetVariants()
  for (const [group, value] of Object.entries(variants)) setVariantValue(group as VariantKey, value)
}

export function applyState(
  test: LabTest,
  state: LabState,
  navigate: (path: string) => void,
  fresh = false,
  variants: Partial<Record<VariantKey, string>> = test.variants,
) {
  if (fresh || getLabResults().activeTest !== test.id) {
    applyVariants(variants)
    if (test.freshOutputs) {
      clearAddedOutputs()
      clearNeedsDismissed()
    }
    setActiveTest(test.id)
  }
  const sim = state.sim === undefined ? test.sim : state.sim
  const now = Date.now()
  if (!sim) stopScenario()
  else if (sim.kind === "slow-load") startScenario(sim)
  else {
    const runs =
      sim.kind === "journey" && state.runsAgo
        ? Object.fromEntries(Object.entries(state.runsAgo).map(([stage, ago]) => [stage, now - ago]))
        : undefined
    const frozen = !state.play && state.pauseAtMs === undefined
    startScenario({
      ...sim,
      startedAt: now - (state.atMs ?? 0),
      pausedAt: frozen ? now : undefined,
      pauseAtMs: state.pauseAtMs,
      ...(runs ? { runs } : {}),
    })
  }
  if (state.outputs) setOutputsFor(DONE, state.outputs)
  if (state.needsDismissed !== undefined) setNeedsDismissedFor(DONE, state.needsDismissed)
  activeStore.set({ testId: test.id, stateId: state.id })
  const path = state.path ?? test.path
  if (state.reload && !IN_LAB_FRAME) window.location.assign(path)
  else navigate(path)
}

