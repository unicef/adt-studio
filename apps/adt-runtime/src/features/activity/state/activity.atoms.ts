import { getDefaultStore } from "jotai"
import { ephemeralAtom } from "@/shared/state/persist"

export type ValidateHandler = () => void
export type SkipHandler = () => void
export type SubmitState = "submit" | "next"

export const isActivityPageAtom = ephemeralAtom(false)
export const activityModeAtom = ephemeralAtom(false)

export const submitEnabledAtom = ephemeralAtom(false)
export const skipEnabledAtom = ephemeralAtom(false)

export const validateHandlerAtom = ephemeralAtom<ValidateHandler | null>(null)
export const skipHandlerAtom = ephemeralAtom<SkipHandler | null>(null)

export const submitStateAtom = ephemeralAtom<SubmitState>("submit")
export const submitLabelAtom = ephemeralAtom<string | null>(null)

/**
 * Hides the dock's submit button entirely. Set by activities that judge an
 * answer the moment it is chosen (quiz / multiple choice), where a separate
 * "Submit" step is a dead control. Those activities still reveal the button
 * once it becomes "Next", so the reader can move on.
 */
export const submitHiddenAtom = ephemeralAtom(false)

export const selectedOptionAtom = ephemeralAtom<string | null>(null)
export const selectedWordAtom = ephemeralAtom<string | null>(null)
export const currentWordAtom = ephemeralAtom<string | null>(null)

export const confettiTriggerAtom = ephemeralAtom(0)

/**
 * The most recent activity/quiz verdict, broadcast when the child submits.
 * `token` increments on every judge so subscribers re-fire even on the same
 * verdict. Consumed by the kids-mode buddy reaction (correct → celebrate,
 * incorrect → encourage).
 */
export interface ActivityResult {
  correct: boolean
  token: number
}

export const activityResultAtom = ephemeralAtom<ActivityResult>({
  correct: false,
  token: 0,
})

/** Broadcast an activity/quiz verdict to subscribers (e.g. the kids buddy). */
export function emitActivityResult(correct: boolean): void {
  const store = getDefaultStore()
  store.set(activityResultAtom, {
    correct,
    token: store.get(activityResultAtom).token + 1,
  })
}
