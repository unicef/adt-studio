import { useCallback, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import type { LeaveEditorDialogProps } from "./LeaveEditorDialog"
import type { StoryboardEditorSession } from "./useStoryboardEditor"

export interface EditorGate {
  guard: (action: () => void) => void
  dialog: LeaveEditorDialogProps
}

type GateSession = Pick<StoryboardEditorSession, "dirty" | "saving" | "save" | "discard">

export function useEditorGate({ dirty, saving, save, discard }: GateSession): EditorGate {
  const { t } = useLingui()
  const [pending, setPending] = useState<(() => void) | null>(null)

  const guard = useCallback(
    (action: () => void) => {
      if (dirty) setPending(() => action)
      else action()
    },
    [dirty],
  )

  const finish = useCallback(() => {
    setPending(null)
    pending?.()
  }, [pending])

  const onSave = useCallback(async () => {
    try {
      await save()
      finish()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Save failed`)
    }
  }, [save, finish, t])

  const onDiscard = useCallback(() => {
    discard()
    finish()
  }, [discard, finish])

  const onCancel = useCallback(() => setPending(null), [])

  return {
    guard,
    dialog: { open: pending !== null, saving, onCancel, onDiscard, onSave },
  }
}
