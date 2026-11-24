import type { SetupBookFactId, SetupDecided, SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { PRESETS, RENDER_STRATEGIES } from "@/components/wizard/core/constants"
import { askedFacts, factsBehind, FACT_IDS, SETTING_IDS, settingsFor, type FactAnswers } from "../../engine/answers"

export type SettingValue = string | boolean
export type Overrides = Partial<Record<SetupSettingId, SettingValue>>

/** Where a bookmark's value came from: the AI, the user's answer to a note, or the user changing it. */
export type SettingSource = "ai" | "answered" | "changed"

export type BookSetting = {
  id: SetupSettingId
  value: SettingValue
  /** The AI's own pick, before any answer. */
  ai: SettingValue
  /** What the notes' answers give, before any change by hand. */
  base: SettingValue
  rule: string
  source: SettingSource
  locked: boolean
  pages: number[]
  options: SettingValue[]
  /** Facts whose answer moves this setting. */
  dependsOn: SetupBookFactId[]
}

/** One note in the margin: something the AI measured or read, and the pages that show it. */
export type Finding =
  | { key: "text"; pages: number[]; asked: false }
  | { key: "pages"; pages: number[]; rule: string; asked: false }
  | { key: SetupBookFactId; pages: number[]; fact: SetupFact; asked: boolean }

const RULE_USER = "user"

function strategiesFor(preset: SettingValue): string[] {
  const allowed = (PRESETS.find((p) => p.id === preset)?.renderStrategies ?? []) as readonly string[]
  return RENDER_STRATEGIES.filter((r) => !("hidden" in r && r.hidden) && allowed.includes(r.id)).map((r) => r.id)
}

const OPTIONS: Record<Exclude<SetupSettingId, "renderStrategy">, SettingValue[]> = {
  preset: ["storybook", "textbook", "reference"],
  pageGrouping: ["single", "spread"],
  sectioningMode: ["page", "dynamic"],
  activitiesGenerator: [true, false],
  figureExtraction: ["auto", "off"],
}

/** The settings as they stand: the rulebook's row for the answers, then what the user changed by hand. */
export function currentSettings(rec: SetupRecommendation, answers: FactAnswers, overrides: Overrides): SetupDecided {
  const base = settingsFor(rec, answers)
  const out: SetupDecided = { ...base }
  for (const id of SETTING_IDS) if (overrides[id] !== undefined) out[id] = { value: overrides[id]!, rule: RULE_USER }
  const strategies = strategiesFor(out.preset!.value)
  if (!strategies.includes(String(out.renderStrategy!.value))) {
    const fallback = PRESETS.find((p) => p.id === out.preset!.value)?.recommendations.renderStrategy ?? strategies[0]
    out.renderStrategy = { value: String(fallback), rule: RULE_USER }
  }
  return out
}

export function bookSettings(rec: SetupRecommendation, answers: FactAnswers, overrides: Overrides, answered: Set<SetupBookFactId>): BookSetting[] {
  const now = currentSettings(rec, answers, overrides)
  const base = currentSettings(rec, answers, {})
  return SETTING_IDS.map((id) => {
    const pick = now[id]!
    const ai = rec.settings[id]!.value
    const dependsOn = factsBehind(rec, answers, id)
    const source: SettingSource = pick.rule === RULE_USER ? "changed" : pick.value !== ai || dependsOn.some((f) => answered.has(f)) ? "answered" : "ai"
    return {
      id,
      value: pick.value,
      ai,
      base: base[id]!.value,
      rule: pick.rule,
      source,
      locked: rec.lockedSettings.includes(id),
      pages: [...new Set(rec.settingEvidence[id] ?? [])].sort((a, b) => a - b),
      options: id === "renderStrategy" ? strategiesFor(now.preset!.value) : OPTIONS[id],
      dependsOn,
    }
  })
}

const uniq = (pages: number[]) => [...new Set(pages)].sort((a, b) => a - b)

/** The notes, questions first, then what was measured, then what the readings found. */
export function findings(rec: SetupRecommendation): Finding[] {
  const asked = askedFacts(rec)
  const questions: Finding[] = asked.map((fact) => ({ key: fact.id, pages: uniq(fact.evidencePages), fact, asked: true }))
  const measured: Finding[] = [
    { key: "pages", pages: uniq(rec.measured.pageStorageEvidence.length ? rec.measured.pageStorageEvidence : (rec.settingEvidence.pageGrouping ?? [])), rule: rec.settings.pageGrouping!.rule, asked: false },
    { key: "text", pages: uniq(rec.measured.textLayerEvidence), asked: false },
  ]
  const read: Finding[] = FACT_IDS.map((id) => rec.facts.find((f) => f.id === id))
    .filter((f): f is SetupFact => !!f && !f.ask)
    .map((fact) => ({ key: fact.id, pages: uniq(fact.evidencePages), fact, asked: false }))
  return [...questions, ...measured, ...read]
}

/** Settings this fact moves, given the other answers. */
export function settingsDrivenBy(rec: SetupRecommendation, answers: FactAnswers, fact: SetupBookFactId): SetupSettingId[] {
  return SETTING_IDS.filter((id) => factsBehind(rec, answers, id).includes(fact))
}

/** The pages shown together: [left, right] for a spread (page 1 sits alone on the right), [n] one at a time. */
export function viewOf(page: number, numPages: number, single: boolean): (number | null)[] {
  const n = Math.max(1, Math.min(page, Math.max(1, numPages)))
  if (single) return [n]
  if (n === 1) return [null, 1]
  const left = n % 2 === 0 ? n : n - 1
  return [left, left + 1 <= numPages ? left + 1 : null]
}

/** The first page of the view after (+1) or before (-1) the one holding `page`. */
export function stepView(page: number, numPages: number, single: boolean, dir: 1 | -1): number {
  if (single) return Math.max(1, Math.min(numPages, page + dir))
  const [left, right] = viewOf(page, numPages, false)
  if (dir === 1) return Math.min(numPages, (right ?? left ?? 1) + 1)
  return Math.max(1, (left ?? 1) - 1)
}

export const sameView = (a: number, b: number, numPages: number, single: boolean) => viewOf(a, numPages, single).join() === viewOf(b, numPages, single).join()
