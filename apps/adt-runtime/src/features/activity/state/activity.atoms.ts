import { getDefaultStore } from "jotai"
import { ephemeralAtom } from "@/shared/state/persist"

export type ValidateHandler = () => void
export type SkipHandler = () => void
export type SubmitState = "submit" | "next"

export const isActivityPageAtom = ephemeralAtom(false)
export const activityModeAtom = ephemeralAtom(false)

export const submitEnabledAtom = ephemeralAtom(false)
export const skipEnabledAtom = ephemeralAtom(false)

// Whether the Submit/Next button (and the dock that hosts it) should render at
// all. Standalone quizzes validate on the first click and hide the button
// entirely; every other activity keeps the pick-then-submit flow.
export const submitVisibleAtom = ephemeralAtom(true)

export const validateHandlerAtom = ephemeralAtom<ValidateHandler | null>(null)
export const skipHandlerAtom = ephemeralAtom<SkipHandler | null>(null)

export const submitStateAtom = ephemeralAtom<SubmitState>("submit")
export const submitLabelAtom = ephemeralAtom<string | null>(null)

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
