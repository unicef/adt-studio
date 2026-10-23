import { useCallback, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function useRestoreConfirm(dirty: boolean) {
  const [version, setVersion] = useState<number | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setVersion(null)
  }, [])

  const confirm = useCallback(
    (next: number) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setVersion(next)
      }),
    [],
  )

  const dialog = (
    <AlertDialog
      open={version !== null}
      onOpenChange={(open) => {
        if (!open) settle(false)
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Restore v{version} and discard your edits?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>You have unsaved edits. Restoring an earlier version throws them away. Save them first if you want to keep them as a version.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            <Trans>Keep editing</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            <Trans>Discard and restore</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirmRestore: dirty ? confirm : undefined, dialog }
}
