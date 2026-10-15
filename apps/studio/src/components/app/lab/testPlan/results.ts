import "../frame"
import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { VARIANT_GROUPS, resetVariants, setVariantValue, type VariantKey } from "../variants"
import { startScenario } from "../simulate"
import { clearAddedOutputs, clearNeedsDismissed } from "../outputs"
import { COMBINED_STEPS, LAB_TESTS, type LabTest } from "./tests"

export const NEITHER = "neither"

export interface LabResults {
  picks: Partial<Record<VariantKey, string>>
  notes: Record<string, string>
  checks: Record<string, number[]>
  activeTest: string | null
}

const EMPTY: LabResults = { picks: {}, notes: {}, checks: {}, activeTest: null }

const store = createPersistentStore<LabResults>(
  "adt.lab.results",
  EMPTY,
  (value): value is LabResults => typeof value === "object" && value !== null && "picks" in value && "notes" in value,
)

export const useLabResults = store.use
export const getLabResults = store.get

export function setPick(group: VariantKey, value: string) {
  store.set((previous) => ({ ...previous, picks: { ...previous.picks, [group]: value } }))
}

export function setNote(testId: string, note: string) {
  store.set((previous) => ({ ...previous, notes: { ...previous.notes, [testId]: note } }))
}

export function toggleCheck(testId: string, index: number) {
  store.set((previous) => {
    const current = new Set(previous.checks[testId] ?? [])
    if (current.has(index)) current.delete(index)
    else current.add(index)
    return { ...previous, checks: { ...previous.checks, [testId]: [...current].sort((a, b) => a - b) } }
  })
}

export function setActiveTest(testId: string | null) {
  store.set((previous) => ({ ...previous, activeTest: testId }))
}

export function clearResults() {
  store.set(EMPTY)
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

export function applyPicks() {
  resetVariants()
  const { picks } = store.get()
  for (const group of VARIANT_GROUPS) {
    const pick = picks[group.key]
    if (pick && pick !== NEITHER) setVariantValue(group.key, pick)
  }
  startScenario(null)
}

export function testStatus(test: LabTest, results: LabResults): "untested" | "started" | "done" {
  const hasPick = test.noPick || !!results.picks[test.group]
  const hasNote = !!results.notes[test.id]?.trim()
  const checks = results.checks[test.id]?.length ?? 0
  if (hasPick && (hasNote || checks >= test.steps.length)) return "done"
  if (hasPick || hasNote || checks > 0) return "started"
  return "untested"
}

export function resultsMarkdown(results: LabResults, i18n: I18n): string {
  const date = new Date().toISOString().slice(0, 10)
  const lines: string[] = [`# ${i18n._(msg`Variant test results — ${date}`)}`, ""]
  for (const group of VARIANT_GROUPS) {
    const tests = LAB_TESTS.filter((test) => test.group === group.key)
    if (tests.length === 0) continue
    const pick = results.picks[group.key]
    const option = group.options.find((candidate) => candidate.value === pick)
    const pickLabel = pick === NEITHER ? i18n._(msg`neither`) : option ? i18n._(option.label) : "—"
    const groupLabel = i18n._(group.label)
    lines.push(`## ${i18n._(msg`${groupLabel} — pick: ${pickLabel}`)}`)
    for (const test of tests) {
      const done = results.checks[test.id]?.length ?? 0
      const note = results.notes[test.id]?.trim()
      const total = test.steps.length
      const progress = i18n._(msg`${done}/${total} steps`)
      lines.push(`- **${i18n._(test.title)}** (${progress})${note ? `: ${note}` : ""}`)
    }
    lines.push("")
  }
  const combinedNote = results.notes.combined?.trim()
  const combinedDone = results.checks.combined?.length ?? 0
  const combinedTotal = COMBINED_STEPS.length
  lines.push(`## ${i18n._(msg`Combined pass (${combinedDone}/${combinedTotal} steps)`)}`)
  if (combinedNote) lines.push(combinedNote)
  return lines.join("\n")
}
