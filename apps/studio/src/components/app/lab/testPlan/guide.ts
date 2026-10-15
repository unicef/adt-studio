import "../frame"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import type { VariantKey } from "../variants"
import { NEITHER, getLabResults, setUpTest } from "./results"
import { applyState, clearActiveState, statesFor } from "./states"
import { LAB_TESTS, type LabTest } from "./tests"

export interface GuideRound {
  key: string
  label: MessageDescriptor
  goal: MessageDescriptor
  tests: string[]
  usePicks?: string[]
}

export const GUIDE_ROUNDS: GuideRound[] = [
  {
    key: "topbar",
    label: msg`Top bar`,
    goal: msg`One bar for the whole pipeline: location, status, the main action, the secondary screens and the book.`,
    tests: ["top-step", "top-nav", "top-status", "top-action", "top-other", "top-book"],
  },
  {
    key: "layout",
    label: msg`1 · Layout`,
    goal: msg`The workspace itself: top bar, side rails, the dock and floating panels — judged on the finished storyboard.`,
    tests: ["chrome-panels", "features-add", "features-suggested", "ai", "tree-rail", "tree-floating", "editor", "export"],
  },
  {
    key: "not-ready",
    label: msg`2 · Before the storyboard exists`,
    goal: msg`The rules while a book has no storyboard yet: where it opens, what tells you where you are.`,
    tests: ["entry-gated"],
  },
  {
    key: "extract",
    label: msg`3 · Extract`,
    goal: msg`How Extract looks while it runs and how it hands over to Sectioning.`,
    tests: ["running-extract"],
  },
  {
    key: "sectioning",
    label: msg`4 · Sectioning`,
    goal: msg`Sectioning before it runs, while it runs, and how it hands over to the storyboard.`,
    tests: ["landing-action-first", "landing-compact", "running-hub"],
  },
  {
    key: "building",
    label: msg`5 · Storyboard building & loading`,
    goal: msg`The storyboard while its pages are built, and what a cold load looks like.`,
    tests: ["loaders-content", "boot", "boot-splash"],
  },
  {
    key: "outputs",
    label: msg`6 · Outputs`,
    goal: msg`Optional outputs while they run, and getting back to the storyboard when they finish.`,
    tests: ["running-captions", "running-validation", "return-banner", "return-toast"],
  },
  {
    key: "together",
    label: msg`7 · Together`,
    goal: msg`Your picks applied at once, walked as a new book — then today's version for contrast.`,
    tests: ["flow-journey", "flow-outputs", "flow-today"],
    usePicks: ["flow-journey", "flow-outputs"],
  },
]

export interface GuidePosition {
  round: number
  index: number
  collapsed: boolean
}

const store = createPersistentStore<GuidePosition | null>(
  "adt.lab.guide",
  null,
  (value): value is GuidePosition | null => value === null || (typeof value === "object" && value !== null && "round" in value),
)

export const useGuide = store.use

export function guideTest(position: GuidePosition | null): LabTest | undefined {
  if (!position) return undefined
  const id = GUIDE_ROUNDS[position.round]?.tests[position.index]
  return LAB_TESTS.find((test) => test.id === id)
}

export function pickedVariants(): Partial<Record<VariantKey, string>> {
  const { picks } = getLabResults()
  return Object.fromEntries(Object.entries(picks).filter(([, value]) => value && value !== NEITHER)) as Partial<
    Record<VariantKey, string>
  >
}

function open(position: GuidePosition, navigate: (path: string) => void) {
  store.set(position)
  const round = GUIDE_ROUNDS[position.round]
  const test = guideTest(position)
  if (!round || !test) return
  const picks = pickedVariants()
  const inherited = Object.fromEntries((test.inheritPicks ?? []).filter((key) => picks[key]).map((key) => [key, picks[key]]))
  const variants = round.usePicks?.includes(test.id) ? picks : { ...test.variants, ...inherited }
  const first = statesFor(test)[0]
  if (first) applyState(test, first, navigate, true, variants)
  else {
    clearActiveState()
    setUpTest({ ...test, variants }, navigate)
  }
}

export function startGuide(round: number, navigate: (path: string) => void, index = 0) {
  open({ round, index, collapsed: false }, navigate)
}

export function stepGuide(direction: 1 | -1, navigate: (path: string) => void) {
  const position = store.get()
  if (!position) return
  let { round, index } = position
  index += direction
  if (index >= GUIDE_ROUNDS[round].tests.length) {
    if (round + 1 >= GUIDE_ROUNDS.length) return
    round += 1
    index = 0
  } else if (index < 0) {
    if (round === 0) return
    round -= 1
    index = GUIDE_ROUNDS[round].tests.length - 1
  }
  open({ ...position, round, index }, navigate)
}

export function setGuideCollapsed(collapsed: boolean) {
  store.set((previous) => (previous ? { ...previous, collapsed } : previous))
}

export function exitGuide() {
  store.set(null)
}

export function guideTotals(position: GuidePosition) {
  const before = GUIDE_ROUNDS.slice(0, position.round).reduce((sum, round) => sum + round.tests.length, 0)
  const total = GUIDE_ROUNDS.reduce((sum, round) => sum + round.tests.length, 0)
  return { overall: before + position.index + 1, total }
}
