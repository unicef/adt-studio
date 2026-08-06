import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import type { Publication } from "@adt/types"
import type { BookPublicationRecord } from "@/api/client"
import {
  useRevokePublication,
  useSetPublicationExpiry,
  type PublishRunKind,
} from "@/hooks/use-book-publication"
import { Button } from "@/components/ui/button"
import { AccessCodeCard } from "./AccessCodeCard"
import { ExpiryChoice } from "./ExpiryChoice"
import { RevokeDialog } from "./RevokeDialog"
import { ShareLink } from "./ShareLink"
import {
  expiryChoiceToIso,
  formatPublishDate,
  formatPublishDateTime,
  isoToExpiryChoice,
} from "./expiry-options"

interface PublishedStateProps {
  bookLabel: string
  url: string
  record: BookPublicationRecord | null
  publication: Publication | null
  workerReachable: boolean
  hasAccessCode: boolean
  isUpdating: boolean
  /** Set right after a finished run, so the link can acknowledge it. */
  recentRun: PublishRunKind | null
  onUpdate: () => void
}

export function PublishedState({
  bookLabel,
  url,
  record,
  publication,
  workerReachable,
  hasAccessCode,
  isUpdating,
  recentRun,
  onUpdate,
}: PublishedStateProps) {
  const { i18n, t } = useLingui()
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [editingExpiry, setEditingExpiry] = useState(false)
  const revoke = useRevokePublication(bookLabel)
  const expiry = useSetPublicationExpiry(bookLabel)

  const versions = record?.versions ?? []
  const highestVersion = versions.reduce((highest, entry) => Math.max(highest, entry.version), 0)
  const currentVersion =
    publication?.current_version ?? (highestVersion > 0 ? highestVersion : null)
  const currentEntry = versions.find((entry) => entry.version === currentVersion)
  const lastUpdatedAt =
    currentEntry?.published_at ?? publication?.created_at ?? record?.created_at ?? null
  const expiresAt = publication?.expires_at ?? record?.expires_at ?? null
  const [expiryChoice, setExpiryChoice] = useState(() => isoToExpiryChoice(expiresAt))

  const busy = isUpdating || revoke.isPending || expiry.isPending

  function openExpiryEditor() {
    setExpiryChoice(isoToExpiryChoice(expiresAt))
    setEditingExpiry(true)
  }

  function saveExpiry() {
    expiry.mutate(expiryChoiceToIso(expiryChoice), {
      onSuccess: () => setEditingExpiry(false),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <ShareLink url={url} highlight={recentRun !== null} />

      {recentRun && (
        <p
          data-testid="publish-recent-run"
          className="text-sm leading-6 text-emerald-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
        >
          {recentRun === "update" ? (
            <Trans>Updated. The link now shows your latest version.</Trans>
          ) : (
            <Trans>Your book is online. The link above is ready to share.</Trans>
          )}
        </p>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        {currentVersion ? (
          lastUpdatedAt ? (
            <Trans>
              Sharing version {currentVersion} · last updated{" "}
              {formatPublishDateTime(lastUpdatedAt, i18n.locale)}
            </Trans>
          ) : (
            <Trans>Sharing version {currentVersion}</Trans>
          )
        ) : (
          <Trans>Sharing the copy you published.</Trans>
        )}
      </p>

      {!workerReachable && (
        <p
          data-testid="publish-worker-unreachable"
          className="flex items-start gap-2 text-xs leading-5 text-amber-700"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <Trans>
            Your publishing service isn't answering right now, so what you see here may be out of
            date. The link itself is usually fine.
          </Trans>
        </p>
      )}

      <AccessCodeCard
        bookLabel={bookLabel}
        hasAccessCode={hasAccessCode}
        code={record?.access_code ?? null}
        disabled={busy}
      />

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span data-testid="publish-expiry-summary" className="text-sm leading-6 text-foreground">
            {expiresAt ? (
              <Trans>The link stops working on {formatPublishDate(expiresAt, i18n.locale)}.</Trans>
            ) : (
              <Trans>The link has no end date.</Trans>
            )}
          </span>
          {!editingExpiry && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={openExpiryEditor}
            >
              {expiresAt ? <Trans>Change</Trans> : <Trans>Add an end date</Trans>}
            </Button>
          )}
        </div>

        {editingExpiry && (
          <div className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
            <ExpiryChoice
              value={expiryChoice}
              onChange={setExpiryChoice}
              disabled={expiry.isPending}
              label={t`How long should the link keep working?`}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              <Trans>Counted from today. The link and its comments stay as they are.</Trans>
            </p>
            {expiry.error && (
              <p data-testid="publish-expiry-error" aria-live="polite" className="text-xs leading-5 text-destructive">
                <Trans>
                  The end date couldn't be changed, so it's unchanged. Try again in a moment.
                </Trans>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={expiry.isPending} onClick={saveExpiry}>
                {expiry.isPending && (
                  <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                )}
                <Trans>Save end date</Trans>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={expiry.isPending}
                onClick={() => {
                  expiry.reset()
                  setEditingExpiry(false)
                }}
              >
                <Trans>Cancel</Trans>
              </Button>
            </div>
          </div>
        )}
      </div>


      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button data-testid="publish-update-button" disabled={busy} onClick={onUpdate}>
          {isUpdating ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          {isUpdating ? <Trans>Updating the site…</Trans> : <Trans>Update site</Trans>}
        </Button>
        <span className="text-xs leading-5 text-muted-foreground">
          <Trans>Sends your latest edits to the same link.</Trans>
        </span>
        <Button
          data-testid="publish-revoke-button"
          variant="ghost"
          size="sm"
          className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busy}
          onClick={() => setRevokeOpen(true)}
        >
          <Trans>Stop sharing</Trans>
        </Button>
      </div>

      <RevokeDialog
        open={revokeOpen}
        onOpenChange={(next) => {
          setRevokeOpen(next)
          if (!next) revoke.reset()
        }}
        isPending={revoke.isPending}
        errorMessage={revoke.error?.message ?? null}
        onConfirm={() =>
          revoke.mutate(undefined, {
            onSuccess: () => setRevokeOpen(false),
          })
        }
      />
    </div>
  )
}
