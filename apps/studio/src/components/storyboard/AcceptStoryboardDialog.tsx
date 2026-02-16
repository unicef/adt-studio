import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAcceptStoryboard } from "@/hooks/use-books"

interface AcceptStoryboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  totalCount: number
  label: string
  onAccepted?: () => void
}

export function AcceptStoryboardDialog({
  open,
  onOpenChange,
  totalCount,
  label,
  onAccepted,
}: AcceptStoryboardDialogProps) {
  const acceptMutation = useAcceptStoryboard()

  const handleAccept = () => {
    acceptMutation.mutate(label, {
      onSuccess: () => {
        onOpenChange(false)
        onAccepted?.()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Accept Storyboard
          </DialogTitle>
          <DialogDescription>
            All {totalCount} pages have been rendered and reviewed.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <p className="text-sm text-muted-foreground">
            Accepting locks in the current rendering as the baseline. You can then
            run Proof and Master phases directly from this page.
          </p>
        </div>

        {acceptMutation.error && (
          <p className="text-sm text-destructive">
            {acceptMutation.error.message}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={acceptMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={acceptMutation.isPending}>
            {acceptMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Accept & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
