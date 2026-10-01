import { useCallback, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import { hasAnyDrafts } from "./draftStore"
import type { LeaveEditorDialogProps } from "./LeaveEditorDialog"
import type { StoryboardEditorSession } from "./useStoryboardEditor"

export interface LeaveGuard {
  guard: (action: () => void) => void
  pending: (() => void) | null
  clear: () => void
}

export function useLeaveGuard(): LeaveGuard {
  const [pending, setPending] = useState<(() => void) | null>(null)

  const guard = useCallback((action: () => void) => {
    if (hasAnyDrafts()) setPending(() => action)
    else action()
  }, [])

  const clear = useCallback(() => setPending(null), [])

  return { guard, pending, clear }
}

export function useLeaveDialog(
  session: StoryboardEditorSession,
  { pending, clear }: Pick<LeaveGuard, "pending" | "clear">,
): LeaveEditorDialogProps {
  const { t } = useLingui()

  const finish = useCallback(() => {
    clear()
    pending?.()
  }, [clear, pending])

  const onSave = useCallback(async () => {
    try {
      await session.save()
      finish()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Save failed`)
    }
  }, [session, finish, t])

  const onDiscard = useCallback(() => {
    session.discard()
    finish()
  }, [session, finish])

  return { open: pending !== null, saving: session.saving, onCancel: clear, onDiscard, onSave }
}
