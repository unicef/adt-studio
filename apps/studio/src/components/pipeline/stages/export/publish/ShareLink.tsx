import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExternalLinkButton } from "@/components/settings/publishing/ExternalLinkButton"
import { cn } from "@/lib/utils"

interface ShareLinkProps {
  url: string
  highlight?: boolean
}

/** The hero of the published state: the link itself, then copy and open. */
export function ShareLink({ url, highlight = false }: ShareLinkProps) {
  const { t } = useLingui()
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  async function copyLink() {
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await navigator.clipboard.writeText(url)
      setCopyFailed(false)
      setCopied(true)
    } catch {
      setCopied(false)
      setCopyFailed(true)
    }
    timerRef.current = setTimeout(() => {
      setCopied(false)
      setCopyFailed(false)
    }, 2500)
  }

  return (
    <div
      data-testid="publish-share-link"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 transition-[background-color,border-color] duration-300 motion-reduce:transition-none",
        highlight ? "border-emerald-500/40 bg-emerald-500/5" : "border-primary/25 bg-primary/[0.03]",
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Trans>Share link</Trans>
      </span>
      <code className="break-all font-mono text-[13px] leading-6 text-foreground">{url}</code>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void copyLink()} aria-label={t`Copy the share link`}>
          {copied ? (
            <Check
              className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
              aria-hidden="true"
            />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {copied ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}
        </Button>
        <ExternalLinkButton href={url} variant="outline" size="sm">
          <Trans>Open</Trans>
        </ExternalLinkButton>
      </div>
      <span role="status" aria-live="polite" className="text-xs leading-5 text-muted-foreground">
        {copied && <Trans>Link copied to the clipboard.</Trans>}
        {copyFailed && <Trans>Couldn't copy — select the link above and copy it by hand.</Trans>}
      </span>
    </div>
  )
}
