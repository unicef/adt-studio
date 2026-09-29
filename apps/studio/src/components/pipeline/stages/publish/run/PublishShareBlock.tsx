import { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * What replaces the status band once there is a link.
 *
 * Nothing here happens on its own. The author was, by definition, not watching — that is what the
 * previous three minutes were for — so the finish does not dismiss itself, does not navigate, and
 * does not helpfully copy the link to a clipboard the author will overwrite before they look at
 * it. Arriving back at the screen and finding the link waiting is the whole design.
 *
 * `showUrl` is false when the artwork above is already carrying the link — the register art's
 * arrival gesture ends on its own link row, and printing the same URL twice on one screen made the
 * finish read as two components pasted together rather than one page.
 */
export function PublishShareBlock({ url, showUrl = true }: { url: string | null; showUrl?: boolean }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2_000)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div
      data-testid="publish-share-block"
      className="flex w-full shrink-0 flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-[400ms]"
    >
      {url && showUrl ? (
        <p className="w-full truncate rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
          {url}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!url}
          onClick={() => {
            if (!url) return
            void navigator.clipboard?.writeText(url)
            setCopied(true)
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? <Trans>Link copied</Trans> : <Trans>Copy link</Trans>}
        </Button>
        <Button type="button" variant="outline" disabled={!url} asChild={!!url}>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              <Trans>Open it</Trans>
            </a>
          ) : (
            <span>
              <ExternalLink aria-hidden="true" />
              <Trans>Open it</Trans>
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}
