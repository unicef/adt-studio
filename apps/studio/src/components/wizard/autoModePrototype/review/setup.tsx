import { useMemo, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Columns2, LayoutTemplate, Rows3, type LucideIcon } from "lucide-react"
import { PRESETS, RENDER_STRATEGIES, type PresetId, type RenderStrategyId, type WizardPageGrouping, type WizardSectioningMode } from "@/components/wizard/constants"
import { defaultWizardValues, useWizardForm } from "@/components/wizard/wizardForm"
import { STRATEGY_OPTIONS, type StrategyId } from "../decide/questions"
import type { FigureExtractionMode } from "@adt/types"
import type { Decision, DecisionId, Recommendation } from "../recommendation/contract"
import { useRecommendation } from "../recommendation/RecommendationContext"

export type SettingKey = "type" | "look" | "pages" | "sections"
export type BookKind = "picture" | "textbook" | "reference"

/** The recommender's decisions in the wizard's terms. `asked` lists what the user settled in Decide. */
export type AiPicks = { kind: BookKind; preset: PresetId; renderStrategy: StrategyId; pageGrouping: "single" | "spread"; sectioningMode: "page" | "dynamic"; activitiesGenerator: boolean; figureExtraction: FigureExtractionMode; asked: SettingKey[]; decisions: Recommendation }

export type Choice = { value: string; title: string; hint: string; kind?: "ai" | "template" }
export type Setting = { key: SettingKey; icon: LucideIcon; label: ReactNode; value: string; ai: string; answer: ReactNode; why: ReactNode; decision: Decision; choices: Choice[]; source: "ai" | "asked" | "changed" }

/** Which recommender decision each review row shows. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- recommender decision ids
export const DECISION_OF: Record<SettingKey, DecisionId> = { type: "preset", look: "renderStrategy", pages: "pageGrouping", sections: "sectioningMode" }

export function toAiPicks(rec: Recommendation, asked: SettingKey[] = []): AiPicks {
  const preset = rec.preset.choice
  return {
    kind: KIND_OF_PRESET[preset] ?? "picture",
    preset,
    renderStrategy: rec.renderStrategy.choice,
    pageGrouping: rec.pageGrouping.choice,
    sectioningMode: rec.sectioningMode.choice,
    activitiesGenerator: rec.activitiesGenerator.choice === "enabled",
    figureExtraction: rec.figureExtraction.choice,
    asked,
    decisions: rec,
  }
}

/** The current book's picks, from the recommendation the flow holds. `ready` once there is one. */
export function useAiPicks(): { picks: AiPicks; ready: boolean } {
  const result = useRecommendation()
  const picks = useMemo(() => toAiPicks(result?.recommendation ?? EMPTY), [result])
  return { picks, ready: result !== null }
}

/** Fills the wizard form the way the preset grid would, then with the recommendation — so "Open all settings" shows the real wizard prefilled. */
export function applyAiPicks(form: ReturnType<typeof useWizardForm>, picks: AiPicks, overrides: Partial<Pick<AiPicks, "renderStrategy">> = {}) {
  const preset = PRESETS.find((p) => p.id === picks.preset)
  const keep = { label: true, file: true, scope: true, startPage: true, endPage: true, selectedPreset: true, editingLanguage: true, outputLanguages: true }
  for (const [key, value] of Object.entries(defaultWizardValues)) if (!(key in keep)) form.setFieldValue(key as never, value as never)
  for (const [key, value] of Object.entries({ ...preset?.formDefaults, ...preset?.recommendations })) form.setFieldValue(key as never, value as never)
  form.setFieldValue("selectedPreset", picks.preset)
  form.setFieldValue("renderStrategy", (overrides.renderStrategy ?? picks.renderStrategy) as RenderStrategyId)
  form.setFieldValue("pageGrouping", picks.pageGrouping as WizardPageGrouping)
  form.setFieldValue("sectioningMode", picks.sectioningMode as WizardSectioningMode)
  form.setFieldValue("activitiesGenerator", picks.activitiesGenerator)
  form.setFieldValue("figureExtraction", picks.figureExtraction)
}

const KIND_OF_PRESET: Record<string, BookKind> = { textbook: "textbook", storybook: "picture", reference: "reference" }

function none<T extends string>(choice: T) {
  return { choice, confidence: "low" as const, reason: "", alternative: null, ambiguityReason: null, evidencePages: [] as number[] }
}
const EMPTY: Recommendation = {
  preset: none("storybook"),
  renderStrategy: none("fixed_layout"),
  pageGrouping: none("single"),
  sectioningMode: none("page"),
  activitiesGenerator: none("disabled"),
  figureExtraction: none("off"),
}

const PAGE_GROUPING = [
  { value: "single", title: msg`Single`, hint: msg`Every page becomes its own screen, one after another.` },
  { value: "spread", title: msg`Spread`, hint: msg`Facing pages join into one wide screen, so a picture across the gutter stays whole.` },
]
const SECTION_MODE = [
  { value: "page", title: msg`Page`, hint: msg`The entire page is treated as a single section.` },
  { value: "dynamic", title: msg`Dynamic`, hint: msg`Splits a page when it has several distinct activities.` },
]

/**
 * The four settings the AI decides, read live from the wizard form so every screen (and the real
 * wizard) agrees. Each knows the AI's own pick, so it can say "AI pick", "You chose" or "Changed".
 * Labels and values use the wizard's own names (Preset, Render Strategy, Page Grouping Mode,
 * Section Mode; Storybook, Fixed Layout, Spread…) taken from the same message descriptors.
 */
export function useSettings(picks: AiPicks): { settings: Setting[]; kind: BookKind; set: (key: SettingKey, value: string) => void } {
  const form = useWizardForm()
  const values = useStore(form.store, (s) => s.values)
  const { i18n } = useLingui()
  const typeChoices: Choice[] = PRESETS.filter((p) => p.id !== "custom").map((p) => ({ value: p.id, title: i18n._(p.title), hint: i18n._(p.description) }))
  const sectionChoices: Choice[] = SECTION_MODE.map((o) => ({ value: o.value, title: i18n._(o.title), hint: i18n._(o.hint) }))
  const pageChoices: Choice[] = PAGE_GROUPING.map((o) => ({ value: o.value, title: i18n._(o.title), hint: i18n._(o.hint) }))
  const preset = values.selectedPreset ?? picks.preset
  const kind = KIND_OF_PRESET[preset] ?? picks.kind
  const allowed = [...((PRESETS.find((p) => p.id === preset)?.renderStrategies ?? []) as readonly string[])].filter((id): id is StrategyId => id in STRATEGY_OPTIONS)
  const lookIds: StrategyId[] = allowed.includes(picks.renderStrategy) ? [picks.renderStrategy, ...allowed.filter((id) => id !== picks.renderStrategy)] : allowed
  const strategy = (id: string) => {
    const r = RENDER_STRATEGIES.find((x) => x.id === id)
    return { title: r ? i18n._(r.title) : id, hint: r ? i18n._(r.description) : "", kind: r?.category }
  }
  const lookChoices: Choice[] = lookIds.map((id) => ({ value: id, ...strategy(id) }))

  const source = (key: SettingKey, value: string, ai: string): Setting["source"] => (picks.asked.includes(key) ? "asked" : value === ai ? "ai" : "changed")
  const make = (key: SettingKey, icon: LucideIcon, label: ReactNode, value: string, ai: string, choices: Choice[]): Setting => {
    const from = source(key, value, ai)
    const suggested = choices.find((c) => c.value === ai)?.title ?? (key === "look" ? strategy(ai).title : typeChoices.find((c) => c.value === ai)?.title)
    return {
      key,
      icon,
      label,
      value,
      ai,
      choices,
      answer: choices.find((c) => c.value === value)?.title ?? choices[0]?.title,
      why: from === "changed" ? <Trans>Changed by you. I had suggested {suggested}.</Trans> : from === "asked" ? <Trans>You picked this when I asked.</Trans> : picks.decisions[DECISION_OF[key]].reason,
      decision: picks.decisions[DECISION_OF[key]],
      source: from,
    }
  }

  const settings = [
    make("type", BookOpen, <Trans>Preset</Trans>, preset, picks.preset, typeChoices),
    make("look", LayoutTemplate, <Trans>Render Strategy</Trans>, values.renderStrategy || picks.renderStrategy, picks.renderStrategy, lookChoices),
    make("pages", Columns2, <Trans>Page Grouping Mode</Trans>, values.pageGrouping || picks.pageGrouping, picks.pageGrouping, pageChoices),
    make("sections", Rows3, <Trans>Section Mode</Trans>, values.sectioningMode || picks.sectioningMode, picks.sectioningMode, sectionChoices),
  ]

  const set = (key: SettingKey, value: string) => {
    if (key === "type") {
      const next = PRESETS.find((p) => p.id === value)
      form.setFieldValue("selectedPreset", value)
      const strategies = (next?.renderStrategies ?? []) as readonly string[]
      if (!strategies.includes(values.renderStrategy)) form.setFieldValue("renderStrategy", (next?.recommendations.renderStrategy ?? strategies[0]) as RenderStrategyId)
    } else if (key === "look") form.setFieldValue("renderStrategy", value as RenderStrategyId)
    else if (key === "pages") form.setFieldValue("pageGrouping", value as WizardPageGrouping)
    else form.setFieldValue("sectioningMode", value as WizardSectioningMode)
  }

  return { settings, kind, set }
}

const ON = msg`On`
const OFF = msg`Off`
const FIGURE = { auto: msg`Auto`, all: msg`All`, off: msg`Off` }

export type Processing = { key: string; label: ReactNode; value: string; on: boolean }

/** What the preset quietly turned on in Content Processing (step 3 of the wizard), with its own names. Read-only here; changed in all settings. */
export function useProcessing(): Processing[] {
  const form = useWizardForm()
  const { i18n } = useLingui()
  const v = useStore(form.store, (s) => s.values)
  const flag = (on: boolean) => i18n._(on ? ON : OFF)
  return [
    { key: "activities", label: <Trans>Activities</Trans>, value: flag(v.activitiesGenerator), on: v.activitiesGenerator },
    { key: "figures", label: <Trans>Figure Extraction</Trans>, value: i18n._(FIGURE[v.figureExtraction as keyof typeof FIGURE] ?? OFF), on: v.figureExtraction !== "off" },
    { key: "segmentation", label: <Trans>Image Segmentation</Trans>, value: flag(v.imageSegmentation), on: v.imageSegmentation },
    { key: "cropping", label: <Trans>Smart Cropping</Trans>, value: flag(v.imageCropping), on: v.imageCropping },
  ]
}
