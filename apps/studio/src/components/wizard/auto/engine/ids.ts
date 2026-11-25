/* eslint-disable lingui/no-unlocalized-strings -- fact and setting ids from the engine, never shown */
import type { SetupBookFactId, SetupSettingId } from "@adt/types"

/**
 * The engine's fact and setting ids, in the order the screens list them. The one copy in Studio:
 * `engine/answers` re-exports them and the one-shot contract reuses `SETTING_IDS`. Kept free of UI
 * imports so the contract can use it.
 */

export const FACT_IDS: SetupBookFactId[] = ["genre", "exercises", "composition", "diagrams"]
export const SETTING_IDS: SetupSettingId[] = ["preset", "renderStrategy", "pageGrouping", "sectioningMode", "activitiesGenerator", "figureExtraction"]

/** The answers each fact can take, in the order a question lists them. */
export const FACT_OPTIONS: Record<SetupBookFactId, string[]> = {
  genre: ["story", "textbook", "reference"],
  exercises: ["none", "some", "many"],
  composition: ["text-in-art", "text-beside-art", "text-mostly"],
  diagrams: ["none", "some", "many"],
}
