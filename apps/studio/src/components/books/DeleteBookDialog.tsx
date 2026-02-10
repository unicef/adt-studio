import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface DeleteBookDialogProps {
  label: string | null
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

export function DeleteBookDialog({
  label,
  onConfirm,
  onCancel,
  isPending,
}: DeleteBookDialogProps) {
  return (
    <Dialog open={!!label} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete book</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{label}</strong>? This will
            remove all extracted data and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
