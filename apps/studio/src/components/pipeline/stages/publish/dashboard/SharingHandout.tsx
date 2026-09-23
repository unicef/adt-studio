import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Check, CloudOff, Copy, ExternalLink, KeyRound, Link2, Loader2, LockOpen, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCopyLink } from "@/hooks/use-copy-link"
import { cn } from "@/lib/utils"
import { generateAccessCode } from "../access-code"
import type { DashLink } from "./dashboard-data"
import { useInvitationMessage } from "./invitation-message"

/**
 * The hand-out: everything an author needs to give the book to someone, on the right of the
 * hero. The code is the loudest thing here because it is what readers ask for; "Copy message"
 * sends the title, the link and the code together so they never have to.
 */
export function SharingHandout({ link }: { link: DashLink }) {
  const { t } = useLingui()
  const message = useInvitationMessage(link)
  const copyMessage = useCopyLink(message)
  const copyLink = useCopyLink(link.url)
  const copyCode = useCopyLink(link.accessCode ?? "")
  const [confirming, setConfirming] = useState(false)
  const [rotated, setRotated] = useState(false)
  const canChange = link.workerReachable && !link.isUpdating && !link.accessBusy
  const code = link.hasAccessCode ? link.accessCode : null
  /** A code is required but was set somewhere this computer never saw. */
  const unknownCode = link.hasAccessCode && code === null
  const hasUrl = link.url !== ""
  const rotate = () => {
    setRotated(false)
    link.setAccessCode(generateAccessCode(), () => setRotated(true))
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Trans>Access code</Trans>
        </span>
        {link.hasAccessCode && !confirming ? (
          <button
            type="button"
            disabled={!canChange}
            onClick={() => setConfirming(true)}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
          >
            {link.accessBusy ? (
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            <Trans>New code</Trans>
          </button>
        ) : null}
      </div>

      {code !== null ? (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-[2.125rem] font-semibold leading-none [@media(max-height:820px)]:text-[1.75rem] tracking-[0.18em] text-foreground transition-opacity duration-200 motion-reduce:transition-none",
              link.accessBusy && "opacity-40",
            )}
          >
            <span className="sr-only">
              <Trans>Access code</Trans>{" "}
            </span>
            {code}
          </span>
          <button
            type="button"
            onClick={() => void copyCode.copy()}
            aria-label={t`Copy the access code`}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {copyCode.copied ? (
              <Check className="size-4 text-emerald-600 motion-safe:animate-in motion-safe:zoom-in-50 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      ) : unknownCode ? (
        <span className="flex items-start gap-2 text-sm text-muted-foreground">
          <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <Trans>A code is set, but not on this computer. Make a new one to hand it out.</Trans>
        </span>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockOpen className="size-4 shrink-0" aria-hidden="true" />
            <Trans>None — anyone with the link can open it.</Trans>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={!canChange}
            onClick={rotate}
          >
            {link.accessBusy ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <KeyRound aria-hidden="true" />
            )}
            <Trans>Add a code</Trans>
          </Button>
        </div>
      )}

      {confirming ? (
        <div
          role="group"
          aria-label={t`Generate a new access code`}
          onKeyDown={(event) => {
            if (event.key === "Escape") setConfirming(false)
          }}
          className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-4 text-amber-900 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              <Trans>
                Everyone using the current code is locked out until you send them the new one.
              </Trans>
            </span>
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              autoFocus
              className="h-7 bg-amber-600 px-2.5 text-xs text-white hover:bg-amber-700"
              disabled={!canChange}
              onClick={() => {
                rotate()
                setConfirming(false)
              }}
            >
              <RefreshCw aria-hidden="true" />
              <Trans>Generate new code</Trans>
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setConfirming(false)}>
              <Trans>Keep this one</Trans>
            </Button>
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              className="h-10 flex-1 bg-brand-600 text-white shadow-sm hover:bg-brand-700"
              disabled={!hasUrl}
              onClick={() => {
                void copyMessage.copy()
                setRotated(false)
              }}
            >
              {copyMessage.copied ? (
                <Check className="motion-safe:animate-in motion-safe:zoom-in-50" aria-hidden="true" />
              ) : (
                <Copy aria-hidden="true" />
              )}
              {copyMessage.copied ? <Trans>Message copied</Trans> : <Trans>Copy message</Trans>}
            </Button>
            <Button variant="outline" className="h-10 px-3" disabled={!hasUrl} onClick={() => void copyLink.copy()}>
              {copyLink.copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
              {copyLink.copied ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}
            </Button>
            {hasUrl ? (
              <Button variant="outline" size="icon" className="size-10 shrink-0" asChild>
                <a href={link.url} target="_blank" rel="noreferrer" aria-label={t`Open the shared book in a new tab`}>
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
            ) : null}
          </div>
          <p role="status" aria-live="polite" className="min-h-4 text-[11px] leading-4 text-muted-foreground">
            {!link.workerReachable ? (
              <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
                {link.hasAccessCode ? (
                  <Trans>This code still works. A new one can wait until the service is back.</Trans>
                ) : (
                  <Trans>The link still works. A code can wait until the service is back.</Trans>
                )}
              </span>
            ) : copyMessage.failed || copyLink.failed || copyCode.failed ? (
              <span className="text-amber-700 dark:text-amber-300">
                <Trans>Couldn't copy — try again with the window focused.</Trans>
              </span>
            ) : rotated && code !== null ? (
              <span className="font-medium text-brand-700 dark:text-brand-300">
                <Trans>New code set — copy the message again so readers get it.</Trans>
              </span>
            ) : unknownCode ? (
              <Trans>The message carries the title and the link — not the code.</Trans>
            ) : code !== null ? (
              <Trans>The message carries the title, the link and the code.</Trans>
            ) : (
              <Trans>The message carries the title and the link.</Trans>
            )}
          </p>
        </>
      )}

      {link.changeFailed ? (
        <p role="alert" className="text-[11px] text-amber-700 dark:text-amber-300">
          <Trans>That change didn't go through, so nothing changed.</Trans>
        </p>
      ) : null}
    </div>
  )
}

