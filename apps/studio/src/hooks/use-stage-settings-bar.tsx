import { useNavigate } from "@tanstack/react-router"
import type { StageName } from "@adt/types"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { useSettingsRemount } from "./use-settings-remount"
import { useRegisterDirtyTabs } from "./use-settings-dirty-tabs"
import { useBookRun } from "./use-book-run"
import { useApiKey } from "./use-api-key"
import { useLingui } from "@lingui/react/macro"

export function useStageSettingsBar({
  stage,
  bookLabel,
  dirty,
  dirtyTabs,
  saving,
  save,
}: {
  stage: StageName
  bookLabel: string
  dirty: boolean
  dirtyTabs: string[]
  saving: boolean
  save: () => Promise<void>
}) {
  const { t } = useLingui()
  const remount = useSettingsRemount()
  const { queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const navigate = useNavigate()

  useRegisterDirtyTabs(`settings:${stage}`, stage, dirtyTabs)

  useFloatingSave({
    id: `settings:${stage}`,
    dirty,
    saving,
    onSaveAndRerun: async () => {
      await save()
      queueRun({ fromStage: stage, toStage: stage, apiKey })
      navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: stage } })
    },
    onSaveStay: async () => {
      await save()
      queueRun({ fromStage: stage, toStage: stage, apiKey })
    },
    onDiscard: remount,
    rerunDisabledReason: hasApiKey ? undefined : t`Add an API key to re-run`,
  })
}
