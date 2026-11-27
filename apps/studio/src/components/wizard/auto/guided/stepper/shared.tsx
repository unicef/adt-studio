import type { ReactNode } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react"
import { Trans } from "@lingui/react/macro"
import { BookOpenText, FileUp, ListChecks, WandSparkles } from "lucide-react"
import { STEPS, type StepId } from "../steps"

/** What every stepper design gets from the flow. */
export type StepperProps = {
  /** The step the flow is at. */
  at: StepId
  /** The step on screen (an earlier one when the user went back to look). */
  shown: StepId
  /** Something went wrong at `at`. */
  failed: boolean
  /** The book is being created: earlier steps can't open again. */
  locked: boolean
  /** The book is made: every step is ticked. */
  complete: boolean
  onGo: (step: StepId) => void
  /** On Check, one small bar per screen of Check (CheckBars). */
  checkBars?: ReactNode
  /** Check's progress, 0–1 (for designs that fill a bar). */
  checkProgress?: number
}

const LABEL_MSG: Record<StepId, MessageDescriptor> = {
  upload: msg`Upload`,
  reading: msg`Reading`,
  check: msg`Check`,
  create: msg`Set up`,
}

/** Each step's name, as text (for labels and aria-labels). */
export function useStepName(): (step: StepId) => string {
  const { i18n } = useLingui()
  return (step) => i18n._(LABEL_MSG[step])
}

export const LABEL: Record<StepId, ReactNode> = {
  upload: <Trans>Upload</Trans>,
  reading: <Trans>Reading</Trans>,
  check: <Trans>Check</Trans>,
  create: <Trans>Set up</Trans>,
}

export const ICON: Record<StepId, typeof FileUp> = {
  upload: FileUp,
  reading: BookOpenText,
  check: ListChecks,
  create: WandSparkles,
}

export type StepState = { step: StepId; i: number; done: boolean; current: boolean; onScreen: boolean; canGo: boolean; bad: boolean }

/** Each step's state, the same for every design. */
export function stepStates({ at, shown, failed, locked, complete }: StepperProps): StepState[] {
  const atIndex = STEPS.indexOf(at)
  return STEPS.map((step, i) => {
    const done = i < atIndex || complete
    const current = step === at
    const onScreen = step === shown
    return { step, i, done, current, onScreen, canGo: !onScreen && (current || (done && !locked)), bad: current && failed }
  })
}

/** "(done, open again)" for screen readers on a step that can open again. */
export function OpenAgain({ s, locked }: { s: StepState; locked: boolean }) {
  if (!s.done || locked || s.onScreen) return null
  return (
    <span className="sr-only">
      <Trans>(done, open again)</Trans>
    </span>
  )
}
