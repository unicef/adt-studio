import { memo } from "react"
import {
  VersionPicker,
  type VersionedStep,
} from "@/components/pipeline/components/VersionPicker"
import type { VersionDiffDescriptor } from "@/components/pipeline/components/VersionCompareDialog"
import { useRestoreConfirm } from "./useRestoreConfirm"

const NOOP = () => undefined

export interface StepVersionPickerProps {
  label: string
  step: VersionedStep
  itemId?: string
  currentVersion: number | null
  historyVersion?: number | null
  currentVersionInactive?: boolean
  isSaving?: boolean
  dirty?: boolean
  onRestored?: () => void
  triggerClassName?: string
  triggerLabel?: string
  diff: VersionDiffDescriptor
}

export const StepVersionPicker = memo(function StepVersionPicker({
  label,
  step,
  itemId = "book",
  currentVersion,
  historyVersion,
  currentVersionInactive = false,
  isSaving = false,
  dirty = false,
  onRestored = NOOP,
  triggerClassName,
  triggerLabel,
  diff,
}: StepVersionPickerProps) {
  const { confirmRestore, dialog } = useRestoreConfirm(dirty)
  return (
    <>
      <VersionPicker
        step={step}
        itemId={itemId}
        currentVersion={historyVersion ?? currentVersion}
        currentVersionInactive={currentVersionInactive}
        bookLabel={label}
        saving={isSaving}
        dirty={dirty}
        renderSaveBar={false}
        onRestored={onRestored}
        onDiscard={onRestored}
        confirmRestore={confirmRestore}
        triggerClassName={triggerClassName}
        triggerLabel={triggerLabel}
        diff={diff}
      />
      {dialog}
    </>
  )
})
