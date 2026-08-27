import { Trans } from "@lingui/react/macro"
import { CalendarOff, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useResumePublication } from "@/hooks/use-book-publication"

interface RevokedNoticeProps {
  bookLabel: string
  disabled: boolean
}

/** The revoked state has two ways forward, and they are not equivalent: resuming re-opens the
 *  address people already have, publishing again mints a new one. Resuming is the primary
 *  action because it is the reversible, comment-preserving choice. */
export function RevokedNotice({ bookLabel, disabled }: RevokedNoticeProps) {
  const resume = useResumePublication(bookLabel)

  return (
    <div
      data-testid="publication-revoked"
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
    >
      <div className="flex items-start gap-2.5">
        <CalendarOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm leading-6 text-muted-foreground">
          <Trans>
            You stopped sharing this book, so the old link no longer opens. You can start sharing it
            again on the same link, or publish again for a new one.
          </Trans>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button
          data-testid="publish-resume-button"
          disabled={disabled || resume.isPending}
          onClick={() => resume.mutate()}
        >
          {resume.isPending ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {resume.isPending ? <Trans>Resuming…</Trans> : <Trans>Resume sharing</Trans>}
        </Button>
        <span className="text-xs leading-5 text-muted-foreground">
          <Trans>The same address starts working again, and all the comments are kept.</Trans>
        </span>
      </div>

      {resume.error && (
        <div
          data-testid="publish-resume-error"
          aria-live="polite"
          className="flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        >
          <p className="text-sm leading-6 text-destructive">
            <Trans>
              Sharing couldn't be resumed, so the link is still off. Check that you're online and try
              again.
            </Trans>
          </p>
          <p className="text-xs leading-5 text-muted-foreground">{resume.error.message}</p>
        </div>
      )}
    </div>
  )
}
