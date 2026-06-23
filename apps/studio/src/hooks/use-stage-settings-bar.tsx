import { useNavigate } from "@tanstack/react-router"
import type { StageName } from "@adt/types"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { useSettingsRemount } from "./use-settings-remount"
import { useRegisterDirtyTabs } from "./use-settings-dirty-tabs"
import { useBookRun } from "./use-book-run"
import { useApiKey } from "./use-api-key"
import { useLingui } from "@lingui/react/macro"

/**
 * Registers a stage's settings surface with the shared floating save bar.
 *
 * The bar appears whenever `dirty` is true and offers:
 *   - Save & Re-run → persist, then run this stage now
 *   - Discard       → drop the edits (the section remounts from saved config)
 *
 * There is no plain "save without running": settings changes only take effect
 * via a re-run, so leaving them saved-but-not-run would be a silent stale state.
 * The stage only supplies a `save()` that resolves once its config is
 * persisted; run/navigation/discard wiring lives here so every stage behaves
 * identically.
 */
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
  /** Whether the floating bar should show on the current tab. */
  dirty: boolean
  /** Stage-wide: which tab keys hold unsaved edits (drives dots + leave-guard). */
  dirtyTabs: string[]
  saving: boolean
  /** Persist the stage's settings; must resolve only after the write lands. */
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
    // Same persist + re-run, but no navigation — the leave-guard continues to
    // the user's chosen destination while the run proceeds in the background.
    onSaveStay: async () => {
      await save()
      queueRun({ fromStage: stage, toStage: stage, apiKey })
    },
    onDiscard: remount,
    rerunDisabledReason: hasApiKey ? undefined : t`Add an API key to re-run`,
  })
}
