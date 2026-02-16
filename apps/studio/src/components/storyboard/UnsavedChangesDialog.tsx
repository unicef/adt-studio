import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface UnsavedChangesDialogProps {
  open: boolean
  changedEntities: string[]
  isSaving: boolean
  onSaveAndContinue: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function UnsavedChangesDialog({
  open,
  changedEntities,
  isSaving,
  onSaveAndContinue,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes to{" "}
            {changedEntities.join(", ").toLowerCase()}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDiscard} disabled={isSaving}>
            Discard
          </Button>
          <Button onClick={onSaveAndContinue} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save & continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
