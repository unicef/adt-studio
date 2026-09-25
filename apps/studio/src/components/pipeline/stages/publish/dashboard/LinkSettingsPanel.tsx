import { useId, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ArrowUpCircle, CalendarClock, Check, CloudOff, Copy, KeyRound, Loader2, LockOpen, RefreshCw, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCopyLink } from "@/hooks/use-copy-link"
import { generateAccessCode } from "../access-code"
import { ExpiryChoice } from "../ExpiryChoice"
import { expiryChoiceToIso, formatPublishDate, isoToExpiryChoice, type ExpiryChoiceValue } from "../expiry-options"
import { RevokeDialog } from "../RevokeDialog"
import type { DashLink } from "./dashboard-data"

type Confirm = "rotate" | "remove" | null

/**
 * Who can open the link, and for how long — the answers to "how do I change the code".
 *
 * Every change that locks people out asks first, and says who: a new code means everyone on the
 * old one needs the new one sent to them, removing it opens the book to anyone with the link.
 * Nothing here can change while the service is down or an update is going out.
 * `editEndDate` opens with the end date already being edited, for Extend.
 */
export function LinkSettingsPanel({ link, editEndDate = false }: { link: DashLink; editEndDate?: boolean }) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const confirmId = useId()
  const copyCode = useCopyLink(link.accessCode ?? "")
  const locked = !link.workerReachable || link.isUpdating
  const canChange = !locked && !link.accessBusy

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <KeyRound className="size-3.5" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          <Trans>Access code</Trans>
        </h2>
      </div>

      {link.hasAccessCode && link.accessCode ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xl border bg-muted/40 px-3.5 py-2 font-mono text-2xl font-semibold tracking-[0.2em] text-foreground">
            <span className="sr-only">
              <Trans>Access code</Trans>{" "}
            </span>
            {link.accessCode}
          </span>
          <Button size="sm" variant="outline" onClick={() => void copyCode.copy()}>
            {copyCode.copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copyCode.copied ? <Trans>Copied</Trans> : <Trans>Copy code</Trans>}
          </Button>
        </div>
      ) : link.hasAccessCode ? (
        <p className="flex items-start gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <Trans>A code is required, but it was set on another computer. Make a new one to see it here.</Trans>
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-xs text-muted-foreground">
          <LockOpen className="size-3.5 shrink-0" aria-hidden="true" />
          <Trans>No code — anyone with the link can open the book.</Trans>
        </p>
      )}

      {confirm !== null ? (
        <div
          role="group"
          aria-labelledby={confirmId}
          onKeyDown={(event) => {
            if (event.key === "Escape") setConfirm(null)
          }}
          className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900 motion-safe:animate-in motion-safe:fade-in-0 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <span id={confirmId} className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {confirm === "rotate" ? (
              <Trans>
                Everyone using the current code will be locked out until you send them the new one.
              </Trans>
            ) : (
              <Trans>Anyone with the link will be able to open the book — no code needed.</Trans>
            )}
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              autoFocus
              className="h-7 bg-amber-600 text-white hover:bg-amber-700"
              disabled={!canChange}
              onClick={() => {
                link.setAccessCode(confirm === "rotate" ? generateAccessCode() : null)
                setConfirm(null)
              }}
            >
              {confirm === "rotate" ? <Trans>Generate new code</Trans> : <Trans>Remove the code</Trans>}
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirm(null)}>
              <Trans>Cancel</Trans>
            </Button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {link.hasAccessCode ? (
            <Button size="sm" variant="outline" disabled={!canChange} onClick={() => setConfirm("rotate")}>
              {link.accessBusy ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              <Trans>Generate new code</Trans>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={!canChange} onClick={() => link.setAccessCode(generateAccessCode())}>
              <KeyRound aria-hidden="true" />
              <Trans>Add a code</Trans>
            </Button>
          )}
          {link.hasAccessCode ? (
            <Button size="sm" variant="ghost" disabled={!canChange} onClick={() => setConfirm("remove")}>
              <LockOpen aria-hidden="true" />
              <Trans>Remove code</Trans>
            </Button>
          ) : null}
        </div>
      )}

      <EndDate link={link} locked={locked} initiallyEditing={editEndDate} />
      <UpdateLink link={link} />
      <StopSharing link={link} locked={locked} />

      {!link.workerReachable ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <CloudOff className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <Trans>The sharing service isn't answering, so nothing here can be changed right now. The link and code keep working.</Trans>
        </p>
      ) : link.isUpdating ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-[11px] leading-4 text-muted-foreground">
          <Loader2 className="mt-px size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Trans>An update is going out. These can be changed once it's done.</Trans>
        </p>
      ) : null}

      {link.changeFailed ? (
        <p role="alert" className="text-[11px] text-amber-700 dark:text-amber-300">
          <Trans>That change didn't go through, so nothing changed. Try again in a moment.</Trans>
        </p>
      ) : null}
    </section>
  )
}

/** The end date. A choice counts from today, so picking the one already shown still renews it —
 *  which is why it waits for Save instead of applying on click. */
function EndDate({ link, locked, initiallyEditing }: { link: DashLink; locked: boolean; initiallyEditing: boolean }) {
  const { i18n, t } = useLingui()
  const [editing, setEditing] = useState(initiallyEditing)
  const [choice, setChoice] = useState<ExpiryChoiceValue>(() => isoToExpiryChoice(link.expiresAt))
  const disabled = locked || link.expiryBusy
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 text-xs text-foreground">
          {link.expiresAt ? (
            <Trans>The link stops working on {formatPublishDate(link.expiresAt, i18n.locale)}.</Trans>
          ) : (
            <Trans>The link has no end date.</Trans>
          )}
        </span>
        {editing ? null : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={locked}
            onClick={() => {
              setChoice(isoToExpiryChoice(link.expiresAt))
              setEditing(true)
            }}
          >
            {link.expiresAt ? <Trans>Change</Trans> : <Trans>Add an end date</Trans>}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0">
          <ExpiryChoice value={choice} onChange={setChoice} disabled={disabled} label={t`When the link should stop working`} />
          <span className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={disabled}
              onClick={() => {
                link.setExpiry(expiryChoiceToIso(choice))
                setEditing(false)
              }}
            >
              {link.expiryBusy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              <Trans>Save</Trans>
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
              <Trans>Cancel</Trans>
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** Sending the latest edits is always possible, even when the Studio can't tell whether there
 *  are any; the hero only raises it when it knows. */
function UpdateLink({ link }: { link: DashLink }) {
  return (
    <div className="flex items-center gap-2 border-t pt-3">
      <ArrowUpCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 text-xs text-muted-foreground">
        {link.changesWaiting === false ? (
          <Trans>Readers already see your latest edits.</Trans>
        ) : link.changesWaiting === true ? (
          <Trans>Readers don't see your latest edits yet.</Trans>
        ) : (
          <Trans>Send readers your latest edits — same address, same code.</Trans>
        )}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        disabled={!link.workerReachable || link.isUpdating}
        onClick={link.update}
      >
        <Trans>Update link</Trans>
      </Button>
    </div>
  )
}

function StopSharing({ link, locked }: { link: DashLink; locked: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-2 border-t pt-3">
      <ShieldOff className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 text-xs text-muted-foreground">
        <Trans>Stop sharing takes the link down for everyone. You can share again later.</Trans>
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs text-destructive hover:text-destructive"
        disabled={locked}
        onClick={() => {
          link.clearFailures()
          setOpen(true)
        }}
      >
        <Trans>Stop sharing</Trans>
      </Button>
      <RevokeDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => link.revoke(() => setOpen(false))}
        isPending={link.revoking}
        errorMessage={link.revokeError}
      />
    </div>
  )
}
