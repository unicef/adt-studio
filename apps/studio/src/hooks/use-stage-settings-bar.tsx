import { useNavigate } from "@tanstack/react-router"
import type { StageName } from "@adt/types"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { useSettingsRemount } from "./use-settings-remount"
import { useRegisterDirtyTabs } from "./use-settings-dirty-tabs"
import { useBookRun } from "./use-book-run"
import { useApiKey, useBookStructuredTextAvailability } from "./use-api-key"
import { useLingui } from "@lingui/react/macro"
import { useStageRunConfirmation } from "@/components/pipeline/components/use-stage-run-confirmation"

export function useStageSettingsBar({
  stage,
  bookLabel,
  dirty,
  dirtyTabs,
  saving,
  save,
  showSaveOnly = false,
  disabledReason,
}: {
  stage: StageName
  bookLabel: string
  dirty: boolean
  dirtyTabs: string[]
  saving: boolean
  save: () => Promise<void>
  showSaveOnly?: boolean
  disabledReason?: string
}) {
  const { t } = useLingui()
  const remount = useSettingsRemount()
  const { queueRun, isRunning } = useBookRun()
  const { apiKey } = useApiKey()
  const hasStructuredTextProvider = useBookStructuredTextAvailability(bookLabel)
  const navigate = useNavigate()
  const protectedStage = stage === "toc" || stage === "sectioning"
  const confirmation = useStageRunConfirmation({
    bookLabel, stage,
    available: hasStructuredTextProvider && !isRunning && !disabledReason,
    colorClass: "bg-amber-600 hover:bg-amber-700",
  })
  const saveAndRun = async (leave: boolean) => {
    const apply = async (options = {}, stillCurrent = () => true) => {
      await save()
      // Settings may finish saving after navigation. Never queue the old
      // consent through a new book's run context or navigate back to it.
      if (!stillCurrent()) return false
      queueRun({ fromStage: stage, toStage: stage, apiKey, ...options })
      if (leave) navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: stage }, ignoreBlocker: true })
      return true
    }
    if (!protectedStage) { await apply(); return true }
    if (saving) return false
    return confirmation.requestRun(apply)
  }

  useRegisterDirtyTabs(`settings:${stage}`, stage, dirtyTabs)

  useFloatingSave({
    id: `settings:${stage}`,
    dirty,
    saving: saving || (protectedStage && confirmation.busy),
    onSave: showSaveOnly ? save : undefined,
    onSaveAndRerun: async () => {
      await saveAndRun(true)
    },
    onSaveStay: async () => {
      if (!await saveAndRun(false)) throw new Error("Run not confirmed")
    },
    onDiscard: remount,
    saveDisabledReason: disabledReason,
    rerunDisabledReason:
      disabledReason ?? (hasStructuredTextProvider ? protectedStage ? confirmation.disabledReason : undefined : t`Add an API key to re-run`),
  })
  return { content: <>{confirmation.notice}{confirmation.dialog}</>, busy: saving || confirmation.busy }
}
