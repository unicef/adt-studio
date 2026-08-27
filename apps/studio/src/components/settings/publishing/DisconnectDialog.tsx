import { useEffect, useState } from "react"
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
import { cn } from "@/lib/utils"

interface DisconnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (deleteResources: boolean) => void
  isPending: boolean
  errorMessage?: string | null
}

export function DisconnectDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  errorMessage = null,
}: DisconnectDialogProps) {
  const [deleteResources, setDeleteResources] = useState(false)

  useEffect(() => {
    if (!open) setDeleteResources(false)
  }, [open])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Disconnect from Cloudflare?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              This computer will forget your token and Account ID, so you won't be able to publish
              or update books until you connect again. Books you have already published stay online
              and their links keep working.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div
          className={cn(
            "flex flex-col gap-2 rounded-lg border p-3 transition-[background-color,border-color] duration-200 motion-reduce:transition-none",
            deleteResources ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/30",
          )}
        >
          <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-6 text-foreground">
            <input
              type="checkbox"
              data-testid="delete-resources-optin"
              className="mt-1 size-4 shrink-0 accent-destructive"
              checked={deleteResources}
              onChange={(event) => setDeleteResources(event.target.checked)}
            />
            <span>
              <Trans>
                Also delete the publishing service and every published book from my Cloudflare
                account
              </Trans>
            </span>
          </label>
          {deleteResources && (
            <p className="pl-7 text-sm leading-6 text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
              <Trans>
                This cannot be undone. Every link you have shared will stop working, and all
                comments people left will be deleted.
              </Trans>
            </p>
          )}
        </div>

        {errorMessage && (
          <div
            data-testid="disconnect-error"
            aria-live="polite"
            className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
          >
            <span className="text-sm font-medium text-foreground">
              <Trans>That didn't finish</Trans>
            </span>
            <p className="text-sm leading-6 text-muted-foreground">
              <Trans>
                Your connection is still here, so nothing is half-forgotten. You can try again, or
                untick the delete option and just disconnect — then tidy up in Cloudflare yourself.
              </Trans>
            </p>
            <p className="text-xs leading-5 text-muted-foreground">{errorMessage}</p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            <Trans>Keep my connection</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              deleteResources &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault()
              onConfirm(deleteResources)
            }}
          >
            {isPending && (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            {deleteResources ? (
              <Trans>Disconnect and delete everything</Trans>
            ) : (
              <Trans>Disconnect</Trans>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
