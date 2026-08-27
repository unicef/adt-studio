import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Copy, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPublishDate } from "@/components/pipeline/stages/publish/expiry-options"

const COPIED_MS = 2500

interface PublishingInvitationProps {
  title: string
  url: string
  /** Plaintext, from the book's own record. `null` when the link needs no code — or when this
   *  machine does not have the code, in which case it must not be promised in the message. */
  accessCode: string | null
  expiresAt: string | null
}

/**
 * The message an author sends when they hand the book over.
 *
 * This is the chore the dashboard was making somebody do by hand every single time: copy the
 * link, copy the code from somewhere else, then type a sentence joining them — and remember to
 * mention the end date, which people forget until a reviewer writes back to say the link is
 * dead. Composing it once, from the same record the page is already reading, is both faster and
 * more accurate than the note a person would write.
 *
 * The exact text is shown rather than described. A copy button whose result you cannot see is a
 * small act of faith, and this text is going to a class.
 */
export function PublishingInvitation({
  title,
  url,
  accessCode,
  expiresAt,
}: PublishingInvitationProps) {
  const { i18n, t } = useLingui()
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  /** Built line by line so each one is its own translatable string — a single template would
   *  hand translators a paragraph with three values buried in it. */
  const lines = [
    t`${title} is ready to read.`,
    "",
    t`Open: ${url}`,
    ...(accessCode === null ? [] : [t`Access code: ${accessCode}`]),
    ...(expiresAt === null
      ? []
      : ["", t`The link stops working on ${formatPublishDate(expiresAt, i18n.locale)}.`]),
  ]
  const message = lines.join("\n")

  async function copy() {
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await navigator.clipboard.writeText(message)
      setFailed(false)
      setCopied(true)
    } catch {
      setCopied(false)
      setFailed(true)
    }
    timerRef.current = setTimeout(() => {
      setCopied(false)
      setFailed(false)
    }, COPIED_MS)
  }

  return (
    <div
      data-testid="publish-invitation"
      className="flex flex-col gap-2.5 rounded-xl border bg-card p-4"
    >
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Send className="size-3.5 shrink-0" aria-hidden="true" />
        <Trans>Hand it to your readers</Trans>
      </span>

      <pre
        data-testid="publish-invitation-preview"
        className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2 font-sans text-xs leading-5 text-foreground/85"
      >
        {message}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void copy()}>
          {copied ? (
            <Check
              className="text-emerald-600 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
              aria-hidden="true"
            />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {copied ? <Trans>Copied</Trans> : <Trans>Copy this message</Trans>}
        </Button>
        <span role="status" aria-live="polite" className="text-[11px] leading-4">
          {failed ? (
            <span className="text-amber-700">
              <Trans>Couldn't copy — select the text above instead.</Trans>
            </span>
          ) : accessCode === null ? (
            <span className="text-muted-foreground">
              <Trans>Anyone with the link can open it.</Trans>
            </span>
          ) : (
            <span className="text-muted-foreground">
              <Trans>Includes the code, so nobody has to ask for it.</Trans>
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
