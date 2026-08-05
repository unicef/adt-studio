import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export type ActId = "link" | "privacy" | "comment" | "control"

export interface StoryAct {
  id: ActId
  durationMs: number
  captionMsg: MessageDescriptor
  srDescriptionMsg: MessageDescriptor
}

export const STORY_ACTS: readonly StoryAct[] = [
  {
    id: "link",
    durationMs: 3800,
    captionMsg: msg`Send one link.`,
    srDescriptionMsg: msg`A private web address is typed into the browser bar and the book's page fades in.`,
  },
  {
    id: "privacy",
    durationMs: 3400,
    captionMsg: msg`Keep it private.`,
    srDescriptionMsg: msg`A one-time access code unlocks the page — only people you share it with can open it.`,
  },
  {
    id: "comment",
    durationMs: 4200,
    captionMsg: msg`They comment right on the page.`,
    srDescriptionMsg: msg`A reviewer named Maria pins a comment on the heading while João reads alongside her.`,
  },
  {
    id: "control",
    durationMs: 3400,
    captionMsg: msg`You stay in charge.`,
    srDescriptionMsg: msg`The comment is marked resolved, staying visible only to you and your reviewers.`,
  },
]

export const STORY_TOTAL_DURATION_MS = STORY_ACTS.reduce((sum, act) => sum + act.durationMs, 0)

export const ACT_START_MS: readonly number[] = STORY_ACTS.reduce<number[]>((starts, act, index) => {
  starts.push(index === 0 ? 0 : starts[index - 1] + STORY_ACTS[index - 1].durationMs)
  return starts
}, [])

export function actIndexAtElapsed(elapsedMs: number): number {
  const wrapped = ((elapsedMs % STORY_TOTAL_DURATION_MS) + STORY_TOTAL_DURATION_MS) % STORY_TOTAL_DURATION_MS
  for (let index = STORY_ACTS.length - 1; index >= 0; index -= 1) {
    if (wrapped >= ACT_START_MS[index]) return index
  }
  return 0
}


