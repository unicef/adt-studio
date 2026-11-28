/**
 * Fixed rulebook: book facts -> settings. Same facts always give the same
 * settings. Every setting carries the id of the rule that fired, so the UI can
 * explain it in plain words (and translate it).
 */
import { SetupSettingId, type SetupSettings } from "@adt/types"
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

/** The settings it picks: the wire schema's types (packages/types), so the two can't drift. */
export type RecommendedSettings = SetupSettings
export type SettingId = SetupSettingId
export const SETTING_IDS: SettingId[] = [...SetupSettingId.options]
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
  | "render-overlay-no-text-beside"
  | "render-side-by-side"
  | "render-reflow"
  | "group-joined-spreads"
  | "group-facing-pages"
  | "group-wide-pages"
  | "group-single"
  | "activities-on"
  | "activities-few-cues"
  | "activities-not-in-preset"
  | "activities-none"
  | "sections-split"
  | "sections-school-book"
  | "sections-page"
  | "figures-keep-together"
  | "figures-none"
  | "figures-no-text-layer"

export type Decided = { [K in SettingId]: { value: RecommendedSettings[K]; rule: RuleId } }

/**
 * Whether the PDF's words can be read directly. A mixed book counts when most
 * of its pages carry a real text layer (a few scanned pages don't take the
 * text away from the rest).
 */
export function hasTextLayer(d: MeasuredFacts): boolean {
  if (d.textLayer.value === "digital") return true
  if (d.textLayer.value !== "mixed") return false
  return d.textLayer.scannedPages < d.textLayer.pages / 2
}

/** Median page under this many characters: too few words to count exercise cues on. */
export const MIN_CHARS_FOR_CUES = 100

export function decide(d: MeasuredFacts, s: BookFacts): Decided {
  const preset = ({ story: "storybook", textbook: "textbook", reference: "reference" } as const)[s.genre]

  const pageGrouping: Decided["pageGrouping"] =
    d.pageStorage.value === "spreads-as-separate-pages"
      ? { value: "spread", rule: d.pageStorage.via === "text-facing-picture" ? "group-facing-pages" : "group-joined-spreads" }
      : { value: "single", rule: d.pageStorage.value === "spreads-as-wide-pages" ? "group-wide-pages" : "group-single" }

  const hasText = hasTextLayer(d)
  let renderStrategy: Decided["renderStrategy"]
  if (preset === "reference") renderStrategy = { value: "single_column", rule: "render-reference-column" }
  else if (preset === "textbook") renderStrategy = { value: "llm", rule: "render-textbook-ai" }
  else if (s.composition === "text-in-art")
    renderStrategy = hasText
      ? { value: "fixed_layout", rule: "render-keep-page" }
      : { value: "llm-overlay", rule: "render-overlay-no-text-layer" }
  else if (s.composition === "text-beside-art")
    // Side by side needs real words; a scanned picture book gets its words rebuilt over the page.
    renderStrategy = hasText
      ? { value: "two_column_story", rule: "render-side-by-side" }
      : { value: "llm-overlay", rule: "render-overlay-no-text-beside" }
  else renderStrategy = { value: "llm", rule: "render-reflow" }

  const exercisesPresent = s.exercises !== "none"
  // Storybook and Reference presets drop activity sections, so activities stay
  // off there (turning them on would delete the exercises). In a school book
  // with "some" exercises, the measured cues (blanks, numbered tasks,
  // instruction verbs) must agree when the words can be measured: build-it
  // projects at the end of a chapter (in a computer-architecture textbook) are tasks
  // but nothing the reader answers in the book.
  const cuesMeasurable = d.textDensity.medianChars >= MIN_CHARS_FOR_CUES && hasText
  const answeredInBook = s.exercises === "many" || (exercisesPresent && (d.exerciseCues.value || !cuesMeasurable))
  const activitiesGenerator: Decided["activitiesGenerator"] =
    preset !== "textbook"
      ? { value: false, rule: exercisesPresent ? "activities-not-in-preset" : "activities-none" }
      : answeredInBook
        ? { value: true, rule: "activities-on" }
        : { value: false, rule: exercisesPresent ? "activities-few-cues" : "activities-none" }

  // School books are split into sections by the AI whatever their exercises;
  // other presets read page by page.
  const sectioningMode: Decided["sectioningMode"] =
    preset === "textbook"
      ? { value: "dynamic", rule: exercisesPresent ? "sections-split" : "sections-school-book" }
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
