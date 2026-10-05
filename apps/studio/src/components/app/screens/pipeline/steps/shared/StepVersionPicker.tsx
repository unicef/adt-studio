import { memo } from "react"
import {
  VersionPicker,
  type VersionedStep,
} from "@/components/pipeline/components/VersionPicker"
import type { VersionDiffDescriptor } from "@/components/pipeline/components/VersionCompareDialog"

/**
 * Version history + rollback for a step header, where the classic pipeline kept
 * it: sitting with the count chips on the stage's accent bar, so the picker's
 * default white-on-accent trigger is the right one.
 *
 * The steps using this persist every edit immediately, so there is no pending
 * state to hand the shared floating save bar — this picker is read-and-restore
 * only. `onRestored` still has to be supplied: it is what selects the rollback
 * flow over the classic load-as-pending-edit one, not a callback these steps
 * need.
 */
const NOOP = () => undefined

export interface StepVersionPickerProps {
  label: string
  step: VersionedStep
  /** Versioned entity id — book-level steps store everything under "book". */
  itemId?: string
  currentVersion: number | null
  /** True while a save is in flight; the trigger becomes a spinner. */
  isSaving?: boolean
  diff: VersionDiffDescriptor
}

export const StepVersionPicker = memo(function StepVersionPicker({
  label,
  step,
  itemId = "book",
  currentVersion,
  isSaving = false,
  diff,
}: StepVersionPickerProps) {
  return (
    <VersionPicker
      step={step}
      itemId={itemId}
      currentVersion={currentVersion}
      bookLabel={label}
      saving={isSaving}
      dirty={false}
      renderSaveBar={false}
      onRestored={NOOP}
      onDiscard={NOOP}
      diff={diff}
    />
  )
})
