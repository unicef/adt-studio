/**
 * Fixed rulebook: book facts -> settings. Same facts always give the same
 * settings. Every setting carries the id of the rule that fired, so the UI can
 * explain it in plain words (and translate it). Ported from
 * experiments/setup-recommender/rules.ts.
 */
import type { MeasuredFacts } from "./facts.js"

/** Facts about the book's content that the AI readings answer. */
export interface BookFacts {
  genre: "story" | "textbook" | "reference"
  exercises: "none" | "some" | "many"
  composition: "text-in-art" | "text-beside-art" | "text-mostly"
  diagrams: "none" | "some" | "many"
}
export type BookFactId = keyof BookFacts
export const BOOK_FACT_OPTIONS: { [K in BookFactId]: BookFacts[K][] } = {
  genre: ["story", "textbook", "reference"],
  exercises: ["none", "some", "many"],
  composition: ["text-in-art", "text-beside-art", "text-mostly"],
  diagrams: ["none", "some", "many"],
}
export const BOOK_FACT_IDS = Object.keys(BOOK_FACT_OPTIONS) as BookFactId[]

export interface RecommendedSettings {
  preset: "textbook" | "storybook" | "reference"
  renderStrategy: "llm" | "llm-overlay" | "single_column" | "two_column_story" | "fixed_layout"
  pageGrouping: "single" | "spread"
  sectioningMode: "page" | "dynamic"
  activitiesGenerator: boolean
  figureExtraction: "off" | "auto"
}
export type SettingId = keyof RecommendedSettings
export const SETTING_IDS: SettingId[] = [
  "preset",
  "renderStrategy",
  "pageGrouping",
  "sectioningMode",
  "activitiesGenerator",
  "figureExtraction",
]
/** Settings fixed when the book is created: Extract can't re-run once the book has pages. */
export const LOCKED_SETTINGS: SettingId[] = ["pageGrouping", "figureExtraction"]

export type RuleId =
  | "genre-story"
  | "genre-textbook"
  | "genre-reference"
  | "render-reference-column"
  | "render-textbook-ai"
  | "render-keep-page"
  | "render-overlay-no-text-layer"
  | "render-side-by-side"
  | "render-reflow"
  | "group-joined-spreads"
  | "group-facing-pages"
  | "group-wide-pages"
  | "group-single"
  | "activities-on"
  | "activities-not-in-preset"
  | "activities-none"
  | "sections-split"
  | "sections-page"
  | "figures-keep-together"
  | "figures-none"
  | "figures-no-text-layer"

export type Decided = { [K in SettingId]: { value: RecommendedSettings[K]; rule: RuleId } }

export function decide(d: MeasuredFacts, s: BookFacts): Decided {
  const preset = ({ story: "storybook", textbook: "textbook", reference: "reference" } as const)[s.genre]

  const pageGrouping: Decided["pageGrouping"] =
    d.pageStorage.value === "spreads-as-separate-pages"
      ? { value: "spread", rule: d.pageStorage.via === "text-facing-picture" ? "group-facing-pages" : "group-joined-spreads" }
      : { value: "single", rule: d.pageStorage.value === "spreads-as-wide-pages" ? "group-wide-pages" : "group-single" }

  const hasText = d.textLayer.value === "digital"
  let renderStrategy: Decided["renderStrategy"]
  if (preset === "reference") renderStrategy = { value: "single_column", rule: "render-reference-column" }
  else if (preset === "textbook") renderStrategy = { value: "llm", rule: "render-textbook-ai" }
  else if (s.composition === "text-in-art")
    renderStrategy = hasText
      ? { value: "fixed_layout", rule: "render-keep-page" }
      : { value: "llm-overlay", rule: "render-overlay-no-text-layer" }
  else if (s.composition === "text-beside-art") renderStrategy = { value: "two_column_story", rule: "render-side-by-side" }
  else renderStrategy = { value: "llm", rule: "render-reflow" }

  const exercisesPresent = s.exercises !== "none"
  // Storybook and Reference presets drop activity sections, so activities stay
  // off there (turning them on would delete the exercises).
  const activitiesGenerator: Decided["activitiesGenerator"] =
    preset === "textbook" && exercisesPresent
      ? { value: true, rule: "activities-on" }
      : { value: false, rule: exercisesPresent ? "activities-not-in-preset" : "activities-none" }

  const sectioningMode: Decided["sectioningMode"] =
    preset === "textbook" && exercisesPresent && renderStrategy.value !== "fixed_layout"
      ? { value: "dynamic", rule: "sections-split" }
      : { value: "page", rule: "sections-page" }

  const figureExtraction: Decided["figureExtraction"] =
    hasText && (s.diagrams !== "none" || d.vectorDiagrams.value)
      ? { value: "auto", rule: "figures-keep-together" }
      : { value: "off", rule: hasText ? "figures-none" : "figures-no-text-layer" }

  return {
    preset: { value: preset, rule: `genre-${s.genre}` as RuleId },
    renderStrategy,
    pageGrouping,
    sectioningMode,
    activitiesGenerator,
    figureExtraction,
  }
}

/** Settings that change when one fact takes another value, all else equal. */
export function settingsChangedBy(d: MeasuredFacts, s: BookFacts, fact: BookFactId, value: string): SettingId[] {
  const a = decide(d, s)
  const b = decide(d, { ...s, [fact]: value } as BookFacts)
  return SETTING_IDS.filter((id) => a[id].value !== b[id].value)
}

/** A fact matters when some other answer would change a setting. */
export function factMatters(d: MeasuredFacts, s: BookFacts, fact: BookFactId): boolean {
  return (BOOK_FACT_OPTIONS[fact] as string[]).some((o) => o !== s[fact] && settingsChangedBy(d, s, fact, o).length > 0)
}
