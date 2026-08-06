import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { CalendarClock, KeyRound, Loader2, RefreshCw, Unlock } from "lucide-react"
import type { BookPublicationRecord } from "@/api/client"
import { Button } from "@/components/ui/button"
import { AccessCodeChip } from "@/components/publications/PublicationStatusChip"
import { ExpiryChoice } from "@/components/pipeline/stages/export/publish/ExpiryChoice"
import { RevokeDialog } from "@/components/pipeline/stages/export/publish/RevokeDialog"
import {
  generateAccessCode,
} from "@/components/pipeline/stages/export/publish/access-code"
import {
  expiryChoiceToIso,
  formatPublishDate,
  isoToExpiryChoice,
} from "@/components/pipeline/stages/export/publish/expiry-options"
import {
  useRevokePublication,
  useSetPublicationAccessCode,
  useSetPublicationExpiry,
} from "@/hooks/use-book-publication"

interface PublishingControlsProps {
  bookLabel: string
  record: BookPublicationRecord | null
  hasAccessCode: boolean
  isUpdating: boolean
  onUpdate: () => void
}

/**
 * The three knobs, one line each, plus the two actions.
 *
 * The verbose version of this — a box per knob, each with a paragraph explaining what the button
 * would do — was 300 pixels tall and pushed the roster off the screen. The consequences have not
 * been dropped: rotating a code and stopping sharing both confirm, and the warning belongs in the
 * confirmation, at the moment of the decision, rather than sitting on screen forever.
 */
export function PublishingControls({
  bookLabel,
  record,
  hasAccessCode,
  isUpdating,
  onUpdate,
}: PublishingControlsProps) {
  const { i18n, t } = useLingui()
  const [editingExpiry, setEditingExpiry] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const expiry = useSetPublicationExpiry(bookLabel)
  const accessCode = useSetPublicationAccessCode(bookLabel)
  const revoke = useRevokePublication(bookLabel)

  const busy = isUpdating || expiry.isPending || accessCode.isPending
  const expiresAt = record?.expires_at ?? null

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col divide-y rounded-xl border bg-card">
        {/* Access */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {hasAccessCode ? (
              <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Unlock className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <Trans>Access</Trans>
          </span>

          {hasAccessCode ? (
            <AccessCodeChip code={record?.access_code ?? null} />
          ) : (
            <span className="text-xs text-foreground">
              <Trans>Anyone with the link</Trans>
            </span>
          )}

          <span className="ml-auto flex items-center gap-1">
            {confirmRotate ? (
              <>
                <span className="text-[11px] leading-4 text-amber-700">
                  <Trans>Locks out everyone using the old code.</Trans>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={busy}
                  onClick={() => {
                    accessCode.mutate(generateAccessCode(), {
                      onSettled: () => setConfirmRotate(false),
                    })
                  }}
                >
                  {accessCode.isPending ? (
                    <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : null}
                  <Trans>Confirm</Trans>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setConfirmRotate(false)}
                >
                  <Trans>Cancel</Trans>
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs"
                  disabled={busy}
                  onClick={() => (hasAccessCode ? setConfirmRotate(true) : accessCode.mutate(generateAccessCode()))}
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  {hasAccessCode ? <Trans>New code</Trans> : <Trans>Add a code</Trans>}
                </Button>
                {hasAccessCode ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={busy}
                    onClick={() => accessCode.mutate(null)}
                  >
                    <Trans>Remove</Trans>
                  </Button>
                ) : null}
              </>
            )}
          </span>
        </div>

        {/* End date */}
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
              <Trans>End date</Trans>
            </span>
            <span data-testid="publish-expiry-summary" className="text-xs text-foreground">
              {expiresAt ? (
                formatPublishDate(expiresAt, i18n.locale)
              ) : (
                <Trans>No end date</Trans>
              )}
            </span>
            {editingExpiry ? null : (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 text-xs"
                disabled={busy}
                onClick={() => setEditingExpiry(true)}
              >
                {expiresAt ? <Trans>Change</Trans> : <Trans>Add one</Trans>}
              </Button>
            )}
          </div>

          {editingExpiry ? (
            <div className="flex flex-col gap-2">
              <ExpiryChoice
                value={isoToExpiryChoice(expiresAt)}
                onChange={(choice) => {
                  expiry.mutate(expiryChoiceToIso(choice), {
                    onSuccess: () => setEditingExpiry(false),
                  })
                }}
                disabled={busy}
                label={t`When the link should stop working`}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 self-start text-xs"
                onClick={() => setEditingExpiry(false)}
              >
                <Trans>Cancel</Trans>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Anchored to the bottom of the column: the two actions are the things an author comes
          here to press, and a primary button that drifts up and down with the length of the
          panel above it has to be looked for every time. */}
      <div className="mt-auto flex flex-wrap items-center gap-3 border-t pt-4">
        <Button data-testid="publish-update-button" disabled={busy} onClick={onUpdate}>
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
          disabled={busy}
          onClick={() => setRevokeOpen(true)}
        >
          <Trans>Stop sharing</Trans>
        </Button>
      </div>

      {accessCode.error || expiry.error ? (
        <p role="alert" className="text-xs leading-5 text-destructive">
          <Trans>That change didn't go through, so nothing changed. Try again in a moment.</Trans>
        </p>
      ) : null}

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
