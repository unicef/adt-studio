/* eslint-disable lingui/no-unlocalized-strings -- fact and setting ids from the engine, never shown */
import { setupFactsKey, type SetupBookFactId, type SetupDecided, type SetupFact, type SetupRecommendation, type SetupSettingId } from "@adt/types"
import { PRESETS, type PresetId, type RenderStrategyId, type WizardPageGrouping, type WizardSectioningMode } from "@/components/wizard/core/constants"
import { defaultWizardValues, type useWizardForm } from "@/components/wizard/core/wizardForm"

/**
 * What every Add Book variant does with an engine answer. The engine settles the book's *facts*
 * (what kind of book, are there exercises, where the words sit, labelled pictures); the settings
 * follow from the facts by its fixed rulebook, sent along as `settingsByFacts`, so answering a
 * question here never re-implements a rule.
 */

export type FactAnswers = Record<SetupBookFactId, string>

export const FACT_IDS: SetupBookFactId[] = ["genre", "exercises", "composition", "diagrams"]
export const SETTING_IDS: SetupSettingId[] = ["preset", "renderStrategy", "pageGrouping", "sectioningMode", "activitiesGenerator", "figureExtraction"]

/** The answers each fact can take, in the order a question lists them. */
export const FACT_OPTIONS: Record<SetupBookFactId, string[]> = {
  genre: ["story", "textbook", "reference"],
  exercises: ["none", "some", "many"],
  composition: ["text-in-art", "text-beside-art", "text-mostly"],
  diagrams: ["none", "some", "many"],
}

/** The engine's own answers, before the user says anything. */
export function proposedAnswers(rec: SetupRecommendation): FactAnswers {
  return Object.fromEntries(rec.facts.map((f) => [f.id, f.value])) as FactAnswers
}

/** The facts the engine wants the user to settle, in a stable order. */
export function askedFacts(rec: SetupRecommendation): SetupFact[] {
  return FACT_IDS.map((id) => rec.facts.find((f) => f.id === id)).filter((f): f is SetupFact => !!f && f.ask)
}

/** The settings for a set of answers. Falls back to the proposal if the engine sent no row for them. */
export function settingsFor(rec: SetupRecommendation, answers: FactAnswers): SetupDecided {
  return rec.settingsByFacts[setupFactsKey(answers)] ?? rec.settings
}

/** Settings that change if `fact` takes `value` instead of its current answer. */
export function settingsChangedBy(rec: SetupRecommendation, answers: FactAnswers, fact: SetupBookFactId, value: string): SetupSettingId[] {
  const now = settingsFor(rec, answers)
  const then = settingsFor(rec, { ...answers, [fact]: value })
  return SETTING_IDS.filter((id) => now[id]?.value !== then[id]?.value)
}

/** Which facts a setting depends on: those whose other answers change it. */
export function factsBehind(rec: SetupRecommendation, answers: FactAnswers, setting: SetupSettingId): SetupBookFactId[] {
  return FACT_IDS.filter((fact) => FACT_OPTIONS[fact].some((v) => v !== answers[fact] && settingsChangedBy(rec, answers, fact, v).includes(setting)))
}

/**
 * Fills the wizard form the way the preset grid would, then with the decided settings, so "All
 * settings" and the step-by-step wizard open prefilled. Leaves what the user typed or chose on
 * upload (name, file, page range, languages) alone.
 */
export function applySettings(form: ReturnType<typeof useWizardForm>, settings: SetupDecided) {
  const presetId = settings.preset!.value as PresetId
  const preset = PRESETS.find((p) => p.id === presetId)
  const keep = new Set(["label", "file", "scope", "startPage", "endPage", "editingLanguage", "outputLanguages"])
  for (const [key, value] of Object.entries(defaultWizardValues)) if (!keep.has(key)) form.setFieldValue(key as never, value as never)
  for (const [key, value] of Object.entries({ ...preset?.formDefaults, ...preset?.recommendations })) form.setFieldValue(key as never, value as never)
  form.setFieldValue("selectedPreset", presetId)
  form.setFieldValue("renderStrategy", settings.renderStrategy!.value as RenderStrategyId)
  form.setFieldValue("pageGrouping", settings.pageGrouping!.value as WizardPageGrouping)
  form.setFieldValue("sectioningMode", settings.sectioningMode!.value as WizardSectioningMode)
  form.setFieldValue("activitiesGenerator", settings.activitiesGenerator!.value === true)
  form.setFieldValue("figureExtraction", settings.figureExtraction!.value as "off" | "auto")
}
