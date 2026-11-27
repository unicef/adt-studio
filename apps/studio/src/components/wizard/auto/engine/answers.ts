/* eslint-disable lingui/no-unlocalized-strings -- fact and setting ids from the engine, never shown */
import { setupFactsKey, type SetupBookFactId, type SetupDecided, type SetupFact, type SetupRecommendation, type SetupSettingId } from "@adt/types"
import { PRESETS, type PresetId, type RenderStrategyId, type WizardPageGrouping, type WizardSectioningMode } from "@/components/wizard/core/constants"
import { defaultWizardValues, type useWizardForm } from "@/components/wizard/core/wizardForm"
import { FACT_IDS, FACT_OPTIONS, SETTING_IDS } from "./ids"

/**
 * What every Add Book variant does with an engine answer. The engine settles the book's *facts*
 * (what kind of book, are there exercises, where the words sit, labelled pictures); the settings
 * follow from the facts by its fixed rulebook, sent along as `settingsByFacts`, so answering a
 * question here never re-implements a rule.
 */

export type FactAnswers = Record<SetupBookFactId, string>

export { FACT_IDS, FACT_OPTIONS, SETTING_IDS } from "./ids"

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

/** Settings whose value depends on a fact: some other answer to it would change them. */
export function settingsTouchedBy(rec: SetupRecommendation, answers: FactAnswers, fact: SetupBookFactId): SetupSettingId[] {
  const changed = new Set<SetupSettingId>()
  for (const v of FACT_OPTIONS[fact]) for (const id of settingsChangedBy(rec, answers, fact, v)) changed.add(id)
  return SETTING_IDS.filter((id) => changed.has(id))
}

/**
 * The facts that matter for the current answers: another answer to them would change a setting.
 * The engine's own `matters` flag is worked out for its proposal only, so once the user answers
 * differently (another kind of book, say) other facts may matter and some may stop mattering.
 */
export function factsThatMatter(rec: SetupRecommendation, answers: FactAnswers): SetupBookFactId[] {
  return FACT_IDS.filter((fact) => settingsTouchedBy(rec, answers, fact).length > 0)
}

/** Each preset is the rulebook's answer to one kind of book; the reverse lets a hand change of the preset go through the genre fact. */
const GENRE_OF_PRESET: Partial<Record<string, string>> = { storybook: "story", textbook: "textbook", reference: "reference" }

/** The genre fact that gives this preset, or null for a preset the rulebook never picks. */
export function genreFor(preset: unknown): string | null {
  return GENRE_OF_PRESET[String(preset)] ?? null
}

/** The render strategies a preset offers. */
export function strategiesFor(preset: unknown): string[] {
  return [...((PRESETS.find((p) => p.id === preset)?.renderStrategies ?? []) as readonly string[])]
}

/**
 * A preset only offers some render strategies. Keeps `strategy` if the preset allows it, otherwise
 * the `alternative` if allowed, otherwise the preset's own default. The rulebook never breaks this;
 * it guards hand changes and older answers.
 */
export function fitStrategy(preset: unknown, strategy: string, alternative?: string | null): string {
  const p = PRESETS.find((x) => x.id === preset)
  if (!p) return strategy
  const allowed = strategiesFor(preset)
  if (allowed.includes(strategy)) return strategy
  if (alternative && allowed.includes(alternative)) return alternative
  return String(p.recommendations.renderStrategy ?? allowed[0] ?? strategy)
}

/** A decided row with its render strategy fitted to its preset (`rule` names the fix when one was needed). */
export function fitPreset(settings: SetupDecided, rule = "preset-default"): SetupDecided {
  const strategy = settings.renderStrategy
  if (!strategy) return settings
  const fitted = fitStrategy(settings.preset?.value, String(strategy.value))
  return fitted === strategy.value ? settings : { ...settings, renderStrategy: { value: fitted, rule } }
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
