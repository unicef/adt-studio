import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Copy, KeyRound, Loader2, RefreshCw, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSetPublicationAccessCode } from "@/hooks/use-book-publication"
import { generateAccessCode } from "./access-code"

interface AccessCodeCardProps {
  bookLabel: string
  /** The worker's answer: whether a code is required at all. */
  hasAccessCode: boolean
  /** The plaintext from the book's own record — `null` when this Studio has never seen it
   *  (a book published from another machine), which is legible rather than fatal. */
  code: string | null
  disabled?: boolean
}

type Pending = "rotate" | "remove" | "add" | null

/**
 * The code, beside the link, in the published state. It reads back the plaintext the API kept
 * locally, because the worker cannot: it only ever stored a hash. Rotating and removing both
 * warn about the same thing in the same words — people who are reading right now.
 */
export function AccessCodeCard({
  bookLabel,
  hasAccessCode,
  code,
  disabled = false,
}: AccessCodeCardProps) {
  const { t } = useLingui()
  const mutation = useSetPublicationAccessCode(bookLabel)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const busy = disabled || mutation.isPending

  async function copyCode() {
    if (!code) return
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
    timerRef.current = setTimeout(() => setCopied(false), 2500)
  }

  function apply(next: string | null, kind: Exclude<Pending, null>) {
    setPending(kind)
    mutation.mutate(next, { onSettled: () => setPending(null) })
  }

  if (!hasAccessCode) {
    return (
      <div
        data-testid="publish-access-open"
        className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-2 text-sm leading-6 text-foreground">
            <Unlock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Trans>Anyone with the link can open this book.</Trans>
          </span>
          <Button
            data-testid="publish-access-add-button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={busy}
            onClick={() => apply(generateAccessCode(), "add")}
          >
            {pending === "add" && (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            <Trans>Add an access code</Trans>
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          <Trans>
            Adding a code closes the book to everyone who has only the link, until you give them
            the code.
          </Trans>
        </p>
        {mutation.error && (
          <p
            data-testid="publish-access-error"
            aria-live="polite"
            className="text-xs leading-5 text-destructive"
          >
            <Trans>The code couldn't be changed, so nothing changed. Try again in a moment.</Trans>
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      data-testid="publish-access-code"
      className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/20 p-3"
    >
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
        <Trans>Access code</Trans>
      </span>

      {code ? (
        <div className="flex flex-wrap items-center gap-2">
          <code
            data-testid="publish-access-code-value"
            className="rounded-md border border-border bg-white px-2.5 py-1 font-mono text-base tracking-[0.18em] text-foreground"
          >
            {code}
          </code>
          <Button
            data-testid="publish-access-code-copy"
            size="sm"
            variant="outline"
            disabled={busy}
            aria-label={t`Copy the access code`}
            onClick={() => void copyCode()}
          >
            {copied ? (
              <Check
                className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
                aria-hidden="true"
              />
            ) : (
              <Copy aria-hidden="true" />
            )}
            {copied ? <Trans>Copied</Trans> : <Trans>Copy code</Trans>}
          </Button>
        </div>
      ) : (
        <p data-testid="publish-access-code-unknown" className="text-sm leading-6 text-foreground">
          <Trans>
            This book needs a code to open, but this computer doesn't have a copy of it. Make a new
            one to share — the old code stops working.
          </Trans>
        </p>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        <Trans>Share the link and this code. People type it once per device.</Trans>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="publish-access-rotate-button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => apply(generateAccessCode(), "rotate")}
        >
          {pending === "rotate" ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          <Trans>New code</Trans>
        </Button>
        <Button
          data-testid="publish-access-remove-button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => apply(null, "remove")}
        >
          {pending === "remove" && (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          <Trans>Remove the code</Trans>
        </Button>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        <Trans>
          A new code locks out everybody who typed the old one — including people reading right
          now, who will be asked for the new one. Removing the code opens the book to anyone with
          the link.
        </Trans>
      </p>

      {mutation.error && (
        <p
          data-testid="publish-access-error"
          aria-live="polite"
          className="text-xs leading-5 text-destructive"
        >
          <Trans>The code couldn't be changed, so nothing changed. Try again in a moment.</Trans>
        </p>
      )}
    </div>
  )
}
