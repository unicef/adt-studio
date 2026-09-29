import { Trans, useLingui } from "@lingui/react/macro"
import { CalendarOff, ExternalLink, KeyRound, Link2Off, Share2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { shareState, useCopy, type Publication } from "./share-kit"

const ON_DARK_ICON =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-[background-color,transform] duration-150 hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"

/** Open and copy for a live link, with tooltips. Shared by every variant that shows them. */
function LinkButtons({ url, className }: { url: string; className: string }) {
  const { t } = useLingui()
  const copy = useCopy()
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a href={url} target="_blank" rel="noreferrer" aria-label={t`Open the shared book`} className={className}>
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </TooltipTrigger>
        <TooltipContent>{t`Open the shared book`}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void copy(url, t`Link copied to the clipboard`)}
            aria-label={t`Copy the link to send`}
            className={className}
          >
            <Share2 className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t`Copy the link to send`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * The book's shared copy, on the cover beside its title and details. Sharing is part of what the book *is* right now, so it sits with the title and the
 * details on the cover — the body underneath is left for what to do next. The link actions are
 * the dialog's own round white buttons, like the close button beside them.
 */
export function HeaderSharing({ publication, onOpenSharing }: { publication: Publication; onOpenSharing: () => void }) {
  const { t } = useLingui()
  const copy = useCopy()
  const { live, stopped } = shareState(publication)

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <span
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold backdrop-blur-sm",
          live ? "bg-emerald-500/90 text-white" : "bg-white/15 text-white/90",
        )}
      >
        {live ? (
          <span className="size-1.5 rounded-full bg-white" aria-hidden />
        ) : stopped ? (
          <Link2Off className="size-3.5" aria-hidden />
        ) : (
          <CalendarOff className="size-3.5" aria-hidden />
        )}
        {live ? <Trans>Shared</Trans> : stopped ? <Trans>Sharing stopped</Trans> : <Trans>Link expired</Trans>}
      </span>

      {live && publication.accessCode ? (
        <button
          type="button"
          onClick={() => void copy(publication.accessCode ?? "", t`Access code copied to the clipboard`)}
          title={t`Copy access code`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[12px] text-white/85 backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <KeyRound className="size-3.5" aria-hidden />
          <span className="font-mono font-bold tracking-[0.2em] text-white">{publication.accessCode}</span>
        </button>
      ) : null}

      {live ? <LinkButtons url={publication.url} className={ON_DARK_ICON} /> : null}

      <button
        type="button"
        onClick={onOpenSharing}
        className="inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-white/85 underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        {live ? <Trans>Manage</Trans> : <Trans>Open Sharing</Trans>}
      </button>
    </div>
  )
}
