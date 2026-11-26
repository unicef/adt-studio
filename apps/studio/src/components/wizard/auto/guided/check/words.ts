import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { ScreenId } from "./screens"

/** Each Check screen's title: the stepper's list, the summary and the screen's own heading. */
export const SCREEN_TITLE: Record<ScreenId, MessageDescriptor> = {
  kind: msg`Kind of book`,
  language: msg`Language`,
  look: msg`How the pages look`,
  pages: msg`Pages to import`,
  activities: msg`Exercises and maps`,
  name: msg`Name and set up`,
}
