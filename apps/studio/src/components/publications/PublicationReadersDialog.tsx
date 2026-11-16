import { Trans } from "@lingui/react/macro"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PublicationReaders } from "./PublicationReaders"

/**
 * The roster, in a dialog.
 *
 * A dialog rather than a popover because it opens from a menu item that is closing in the same
 * frame, and an anchored popover loses that dismissal race. The extra room also lets the caveat
 * about who is counted sit where it will actually be read.
 */
export function PublicationReadersDialog({
  token,
  title,
  open,
  onOpenChange,
}: {
  token: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="pr-8">
            <Trans>Readers of “{title}”</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Only people who typed a name are listed. Someone who opened the link and never
              wrote is not counted.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the roster is fetched when it is asked for. */}
        {open && <PublicationReaders token={token} enabled hideHeading />}
      </DialogContent>
    </Dialog>
  )
}
