import { useMemo, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Columns2, LayoutTemplate, Rows3, type LucideIcon } from "lucide-react"
import { PRESETS, RENDER_STRATEGIES, type PresetId, type RenderStrategyId, type WizardPageGrouping, type WizardSectioningMode } from "@/components/wizard/constants"
import { defaultWizardValues, useWizardForm } from "@/components/wizard/wizardForm"
import { STRATEGY_OPTIONS, type StrategyId } from "../decide/questions"
import { useBookAspect } from "../loader/useBookAspect"

export type SettingKey = "type" | "look" | "pages" | "sections"
export type BookKind = "picture" | "textbook" | "reference"

/** What the (mock) AI decided for a book. `asked` lists what it left to the user. */
export type AiPicks = { kind: BookKind; preset: PresetId; renderStrategy: StrategyId; pageGrouping: "single" | "spread"; sectioningMode: "page" | "dynamic"; asked: SettingKey[] }

export type Choice = { value: string; title: string; hint: string; kind?: "ai" | "template" }
export type Setting = { key: SettingKey; icon: LucideIcon; label: ReactNode; value: string; ai: string; answer: ReactNode; why: ReactNode; choices: Choice[]; source: "ai" | "asked" | "changed" }

/** Portrait picture books usually run their pictures across facing pages, so the (mock) AI shows them as spreads. */
const SPREAD_BELOW_ASPECT = 0.95

/** Mock AI answers per sample book (the real ones come from the AI). Picture books with portrait pages are grouped as two-page spreads; landscape and square ones stay one page at a time. */
function aiPicksFor(fileName: string | undefined, aspect?: number): AiPicks {
  const name = (fileName ?? "").toLowerCase()
  if (name.includes("matematica") || name.includes("cuaderno")) return { kind: "textbook", preset: "textbook", renderStrategy: "llm", pageGrouping: "single", sectioningMode: "dynamic", asked: [] }
  if (name.includes("story")) return { kind: "reference", preset: "reference", renderStrategy: "llm", pageGrouping: "single", sectioningMode: "page", asked: [] }
  return { kind: "picture", preset: "storybook", renderStrategy: "fixed_layout", pageGrouping: aspect !== undefined && aspect < SPREAD_BELOW_ASPECT ? "spread" : "single", sectioningMode: "page", asked: [] }
}

/** The AI's picks for the current book. `ready` once the page shape is known (it decides spread vs single). */
export function useAiPicks(): { picks: AiPicks; ready: boolean } {
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const aspect = useBookAspect(file)
  const picks = useMemo(() => aiPicksFor(file?.name, aspect), [file?.name, aspect])
  return { picks, ready: !file || aspect !== undefined }
}

/** Fills the wizard form the way the preset grid would, then with the AI's picks — so "Open all settings" shows the real wizard prefilled. */
export function applyAiPicks(form: ReturnType<typeof useWizardForm>, picks: AiPicks, overrides: Partial<Pick<AiPicks, "renderStrategy">> = {}) {
  const preset = PRESETS.find((p) => p.id === picks.preset)
  const keep = { label: true, file: true, scope: true, startPage: true, endPage: true, selectedPreset: true, editingLanguage: true, outputLanguages: true }
  for (const [key, value] of Object.entries(defaultWizardValues)) if (!(key in keep)) form.setFieldValue(key as never, value as never)
  for (const [key, value] of Object.entries({ ...preset?.formDefaults, ...preset?.recommendations })) form.setFieldValue(key as never, value as never)
  form.setFieldValue("selectedPreset", picks.preset)
  form.setFieldValue("renderStrategy", (overrides.renderStrategy ?? picks.renderStrategy) as RenderStrategyId)
  form.setFieldValue("pageGrouping", picks.pageGrouping as WizardPageGrouping)
  form.setFieldValue("sectioningMode", picks.sectioningMode as WizardSectioningMode)
}

const KIND_OF_PRESET: Record<string, BookKind> = { textbook: "textbook", storybook: "picture", reference: "reference" }

const PAGE_GROUPING = [
  { value: "single", title: msg`Single`, hint: msg`Every page becomes its own screen, one after another.` },
  { value: "spread", title: msg`Spread`, hint: msg`Facing pages join into one wide screen, so a picture across the gutter stays whole.` },
]
const SECTION_MODE = [
  { value: "page", title: msg`Page`, hint: msg`The entire page is treated as a single section.` },
  { value: "dynamic", title: msg`Dynamic`, hint: msg`Splits a page when it has several distinct activities.` },
]

function useWhy(kind: BookKind, grouping: AiPicks["pageGrouping"]): Record<SettingKey, ReactNode> {
  if (kind === "textbook")
    return {
      type: <Trans>Lessons, exercises and lots of headings — it reads like a school book.</Trans>,
      look: <Trans>Rebuilding the pages keeps the exercises easy to use on a phone.</Trans>,
      pages: <Trans>Each page stands on its own, so one at a time reads best.</Trans>,
      sections: <Trans>Some pages are busy, so splitting them makes them easier to follow.</Trans>,
    }
  if (kind === "reference")
    return {
      type: <Trans>Mostly text with a few pictures, like a guide.</Trans>,
      look: <Trans>Rebuilding the pages makes long text comfortable on any screen.</Trans>,
      pages: <Trans>Each page stands on its own, so one at a time reads best.</Trans>,
      sections: <Trans>The pages are short, so there&apos;s no need to split them.</Trans>,
    }
  return {
    type: <Trans>Big pictures on almost every page, with short bits of text.</Trans>,
    look: <Trans>The text is part of the artwork, so keeping each page as printed looks best.</Trans>,
    pages: grouping === "spread" ? <Trans>Many pictures run across two facing pages, so they&apos;re shown together.</Trans> : <Trans>No pictures run across two pages, so one page at a time works.</Trans>,
    sections: <Trans>The pages are short, so there&apos;s no need to split them.</Trans>,
  }
}

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
  const why = useWhy(picks.kind, picks.pageGrouping)
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
      why: from === "changed" ? <Trans>Changed by you. I had suggested {suggested}.</Trans> : from === "asked" ? <Trans>You picked this when I asked.</Trans> : why[key],
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
