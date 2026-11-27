import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SetupBookFactId } from "@adt/types"
import type { ScreenId } from "./screens"

/** Each Check screen's title: the stepper's list, the summary and the screen's own heading. */
export const SCREEN_TITLE: Record<ScreenId, MessageDescriptor> = {
  kind: msg`Kind of book`,
  language: msg`Language`,
  look: msg`How the pages look`,
  spreads: msg`Facing pages`,
  pages: msg`Pages to convert`,
  activities: msg`Exercises and maps`,
  name: msg`Name and set up`,
}

/** A screen's title for this book: Activities is named after what it asks (exercises, maps, or both). */
export function screenTitle(screen: ScreenId, facts: SetupBookFactId[]): MessageDescriptor {
  if (screen !== "activities") return SCREEN_TITLE[screen]
  const exercises = facts.includes("exercises")
  const maps = facts.includes("diagrams")
  if (exercises && !maps) return msg`Exercises`
  if (maps && !exercises) return msg`Maps and diagrams`
  return SCREEN_TITLE.activities
}
