import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SectioningMode } from "@adt/types"
import { api } from "@/api/client"
import { useBookRun } from "./use-book-run"
import { useBookTasks } from "./use-book-tasks"
import { useBookConfigSaving } from "./use-book-config"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"

export function useSectioningModeConfirmation(label: string, saving: boolean) {
  const { t } = useLingui()
  const { isRunning } = useBookRun()
  const { runningCount } = useBookTasks(label)
  const configSaving = useBookConfigSaving(label)
  const state = useQuery({
    queryKey: ["books", label, "sectioning-mode-state"],
    queryFn: () => api.getSectioningModeState(label),
  })
  const [open, setOpen] = useState(false)
  const action = useRef<(() => void) | null>(null)
  const busy = saving || configSaving || isRunning || runningCount > 0 || !state.data || state.isError || state.isFetching
  return {
    busy,
    state: state.data,
    request(mode: SectioningMode, apply: () => void) {
      if (busy) return
      if (mode === state.data?.effectiveMode) { apply(); return }
      if (state.data?.hasOutput) {
        action.current = apply
        setOpen(true)
      } else apply()
    },
    dialog: <CascadeResetDialog
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) action.current = null }}
      affectedStages={[]}
      headerStageSlug="sectioning"
      title={<Trans>Change Sectioning mode?</Trans>}
      description={<Trans>Sectioning and later stages will need to run again. Saved versions are kept.</Trans>}
      confirmLabel={<Trans>Change mode</Trans>}
      confirmColorClass="bg-sky-600 hover:bg-sky-700"
      confirmDisabledReason={busy ? t`Wait for the current operation to finish.` : undefined}
      onConfirm={() => {
        if (busy) return
        const apply = action.current
        action.current = null
        setOpen(false)
        apply?.()
      }}
    />,
  }
}
