import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RevokeDialog } from "@/components/pipeline/stages/publish/RevokeDialog"
import { useRevokePublication } from "@/hooks/use-book-publication"

/**
 * Update site, and stop sharing.
 *
 * Deliberately a component of its own so the page can pin it *outside* the column's scroller.
 * It used to sit at the bottom of the scrolling content with `mt-auto`, which looked anchored on
 * a tall window and put the primary action 36 pixels below the fold on a 760px one — measured,
 * not guessed. A button an author has to scroll to find is not a primary action.
 */
export function PublishingActions({
  bookLabel,
  isUpdating,
  onUpdate,
}: {
  bookLabel: string
  isUpdating: boolean
  onUpdate: () => void
}) {
  const [revokeOpen, setRevokeOpen] = useState(false)
  const revoke = useRevokePublication(bookLabel)

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-t pt-4">
      <Button data-testid="publish-update-button" disabled={isUpdating} onClick={onUpdate}>
        {isUpdating ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        <Trans>Update site</Trans>
      </Button>
      <span className="text-xs text-muted-foreground">
        <Trans>Sends your latest edits to the same link.</Trans>
      </span>
      <Button
        data-testid="publish-revoke-button"
        variant="ghost"
        className="ml-auto text-destructive hover:text-destructive"
        disabled={isUpdating}
        onClick={() => setRevokeOpen(true)}
      >
        <Trans>Stop sharing</Trans>
      </Button>

      <RevokeDialog
        open={revokeOpen}
        onOpenChange={(next) => {
          setRevokeOpen(next)
          if (!next) revoke.reset()
        }}
        onConfirm={() => revoke.mutate(undefined, { onSuccess: () => setRevokeOpen(false) })}
        isPending={revoke.isPending}
        errorMessage={revoke.error?.message ?? null}
      />
    </div>
  )
}
