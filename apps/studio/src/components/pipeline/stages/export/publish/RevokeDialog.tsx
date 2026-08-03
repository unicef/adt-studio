import { Trans } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
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

interface RevokeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
  errorMessage?: string | null
}

export function RevokeDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  errorMessage = null,
}: RevokeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="revoke-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Stop sharing this book?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              The link stops working straight away, for everyone who has it. Anyone who opens it will
              see a short message saying the book isn't shared any more.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="text-sm leading-6 text-muted-foreground">
          <Trans>
            The comments people left are kept, and you can publish again whenever you like — but the
            new link will be a different address, so you'll need to share it again.
          </Trans>
        </p>

        {errorMessage && (
          <div
            data-testid="revoke-error"
            aria-live="polite"
            className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
          >
            <span className="text-sm font-medium text-foreground">
              <Trans>That didn't go through</Trans>
            </span>
            <p className="text-sm leading-6 text-muted-foreground">
              <Trans>
                The link is still live. Check that you're online and try again — nothing was changed.
              </Trans>
            </p>
            <p className="text-xs leading-5 text-muted-foreground">{errorMessage}</p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            <Trans>Keep sharing</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            {isPending && (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            <Trans>Stop sharing</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
