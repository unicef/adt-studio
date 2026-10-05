import { Trans } from "@lingui/react/macro"
import { Loader2, Save } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

export interface LeaveEditorDialogProps {
  open: boolean
  saving: boolean
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export function LeaveEditorDialog({
  open,
  saving,
  onCancel,
  onDiscard,
  onSave,
}: LeaveEditorDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Unsaved changes</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              This page has HTML edits that were not saved. Save them before leaving, or
              discard them to continue.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>
            <Trans>Keep editing</Trans>
          </AlertDialogCancel>
          <Button variant="outline" onClick={onDiscard} disabled={saving}>
            <Trans>Discard</Trans>
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Save />
            )}
            <Trans>Save and continue</Trans>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
