/**
 * Fixed rulebook: facts -> the six settings. Same facts always give the same settings.
 * Each setting returns the rule that fired so the UI can explain it.
 */
import type { DeterministicFacts } from "./facts.ts"

export interface SemanticFacts {
  genre: "story" | "textbook" | "reference"
  exercises: "none" | "some" | "many"
  composition: "text-in-art" | "text-beside-art" | "text-mostly"
  diagrams: "none" | "some" | "many"
}

export interface Settings {
  preset: "textbook" | "storybook" | "reference"
  renderStrategy: "llm" | "llm-overlay" | "single_column" | "two_column_story" | "fixed_layout"
  pageGrouping: "single" | "spread"
  sectioningMode: "page" | "dynamic"
  activitiesGenerator: "enabled" | "disabled"
  figureExtraction: "off" | "auto" | "all"
}
export type Explained = { [K in keyof Settings]: { value: Settings[K]; rule: string } }

/** E1: the semantic facts guessed from measurements only, no LLM. */
export function guessSemanticFacts(f: DeterministicFacts): SemanticFacts {
  const exercises = !f.exerciseCues.value ? "none" : f.exerciseCues.pagesWithCues >= 3 ? "many" : "some"
  const genre = exercises !== "none" ? "textbook" : f.textDensity.class === "dense" ? "reference" : "story"
  const composition = f.textOverPictures.value ? "text-in-art" : f.pictureHeavy.value || f.textDensity.class === "sparse" ? "text-beside-art" : "text-mostly"
  return { genre, exercises, composition, diagrams: f.vectorDiagrams.value ? "some" : "none" }
}

export function decide(d: DeterministicFacts, s: SemanticFacts): Explained {
  const preset = ({ story: "storybook", textbook: "textbook", reference: "reference" } as const)[s.genre]

  const pageGrouping =
    d.pageStorage.value === "spreads-as-separate-pages"
      ? { value: "spread" as const, rule: "Facing pages continue across the gutter, so each pair is joined into one screen." }
      : { value: "single" as const, rule: d.pageStorage.value === "spreads-as-wide-pages" ? "Spreads are already stored as one wide page." : "Pages stand alone." }

  const hasText = d.textLayer.value === "digital"
  let renderStrategy: Explained["renderStrategy"]
  if (preset === "reference") renderStrategy = { value: "single_column", rule: "Reference material reads best as one clean column." }
  else if (preset === "textbook") renderStrategy = { value: "llm", rule: "Lessons and exercises need the AI layout to rebuild their structure." }
  else if (s.composition === "text-in-art")
    renderStrategy = hasText
      ? { value: "fixed_layout", rule: "Text is placed on the pictures, so the original page design is kept." }
      : { value: "llm-overlay", rule: "Text is on the pictures but the PDF has no real text layer, so the AI rebuilds it over the art." }
  else if (s.composition === "text-beside-art") renderStrategy = { value: "two_column_story", rule: "Text sits beside the pictures, so story text and art go side by side." }
  else renderStrategy = { value: "llm", rule: "Mostly text, so the AI layout reflows it." }

  const exercisesPresent = s.exercises !== "none"
  const activitiesGenerator =
    preset === "textbook" && exercisesPresent
      ? { value: "enabled" as const, rule: "The book has exercises for the reader, so they become interactive activities." }
      : { value: "disabled" as const, rule: exercisesPresent ? "Activities are only converted in the Textbook preset." : "No exercises for the reader." }

  const sectioningMode =
    preset === "textbook" && exercisesPresent && renderStrategy.value !== "fixed_layout"
      ? { value: "dynamic" as const, rule: "Pages mix reading and exercises, so each page is split into sections." }
      : { value: "page" as const, rule: "Each page is one unit." }

  const figureExtraction =
    hasText && (s.diagrams !== "none" || d.vectorDiagrams.value)
      ? { value: "auto" as const, rule: "Diagrams with text labels are kept together as figures." }
      : { value: "off" as const, rule: hasText ? "No labelled diagrams." : "Without a text layer there are no labels to group." }

  return { preset: { value: preset, rule: `The book is a ${s.genre}.` }, renderStrategy, pageGrouping, sectioningMode, activitiesGenerator, figureExtraction }
}
