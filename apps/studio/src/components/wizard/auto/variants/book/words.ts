import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SetupBookFactId, SetupSettingId } from "@adt/types"

/** The old wizard's names for the six settings, as the bookmarks show them. */
export const WIZARD_NAME: Record<SetupSettingId, MessageDescriptor> = {
  preset: msg`Preset`,
  renderStrategy: msg`Render Strategy`,
  pageGrouping: msg`Page Grouping`,
  sectioningMode: msg`Section Mode`,
  activitiesGenerator: msg`Activities`,
  figureExtraction: msg`Figure Extraction`,
}

/** The old wizard's names for the values that aren't presets or render strategies. */
export const WIZARD_VALUE: Partial<Record<SetupSettingId, Record<string, MessageDescriptor>>> = {
  pageGrouping: { single: msg`Single Page`, spread: msg`Spread` },
  sectioningMode: { page: msg`Per Page`, dynamic: msg`Dynamic` },
  activitiesGenerator: { true: msg`On`, false: msg`Off` },
  figureExtraction: { auto: msg`Auto`, off: msg`Off` },
}

/** What each note is about, as its heading. */
export const FACT_TOPIC: Record<SetupBookFactId, MessageDescriptor> = {
  genre: msg`Kind of book`,
  exercises: msg`Exercises`,
  composition: msg`Where the words sit`,
  diagrams: msg`Labelled pictures`,
}

export const TOPIC_TEXT = msg`The text`
export const TOPIC_PAGES = msg`Facing pages`
