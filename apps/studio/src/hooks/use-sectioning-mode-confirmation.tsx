import { useEffect, useState } from "react"
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
  const [action, setAction] = useState<{ label: string; apply: () => void } | null>(null)
  useEffect(() => { setAction(null) }, [label])
  const busy = saving || configSaving || isRunning || runningCount > 0 || !state.data || state.isError || state.isFetching
  return {
    busy,
    state: state.data,
    request(mode: SectioningMode, apply: () => void) {
      if (busy) return
      if (mode === state.data?.effectiveMode) { apply(); return }
      if (state.data?.hasOutput) {
        setAction({ label, apply })
      } else apply()
    },
    dialog: <CascadeResetDialog
      open={action?.label === label}
      onOpenChange={(next) => { if (!next) setAction(null) }}
      affectedStages={[]}
      headerStageSlug="sectioning"
      title={<Trans>Change Sectioning mode?</Trans>}
      description={<Trans>This changes how new Sectioning is generated. Saved content and Storyboard stay available. Replacing existing pages requires a separate confirmation.</Trans>}
      confirmLabel={<Trans>Change mode</Trans>}
      confirmColorClass="bg-sky-600 hover:bg-sky-700"
      confirmDisabledReason={busy ? t`Wait for the current operation to finish.` : undefined}
      onConfirm={() => {
        if (busy || action?.label !== label) return
        const apply = action.apply
        setAction(null)
        apply()
      }}
    />,
  }
}
