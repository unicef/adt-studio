import type { SetupDecided, SetupSettings } from "@adt/types"

export type Look = SetupSettings

/** A decided row as plain values, for drawing the preview. */
export function lookOf(decided: SetupDecided): Look {
  return {
    preset: decided.preset?.value as Look["preset"],
    renderStrategy: decided.renderStrategy?.value as Look["renderStrategy"],
    pageGrouping: decided.pageGrouping?.value as Look["pageGrouping"],
    sectioningMode: decided.sectioningMode?.value as Look["sectioningMode"],
    activitiesGenerator: decided.activitiesGenerator?.value === true,
    figureExtraction: decided.figureExtraction?.value as Look["figureExtraction"],
  }
}
