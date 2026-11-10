import { useCallback, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { ArrowRight, Eye, Loader2, Sparkles } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "../FilteredThumb"
import { VerdictMark } from "../second-opinion/AiThumbGrid"
import type { CardLeftOut, CardVerdict } from "./cardModel"
import { Crossfade, ReviewedPill } from "./TierTip"
import { hoverAllowed, useCloseOnScroll } from "../useCloseOnScroll"

const PILL = "relative z-10 flex h-6 cursor-pointer items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold tabular-nums shadow-sm ring-1 ring-white/70 outline-none transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)] motion-reduce:transition-none dark:ring-black/50"
const DOT: Record<CardVerdict, string> = { keep: "bg-emerald-500", unsure: "bg-amber-400", remove: "bg-zinc-400 dark:bg-zinc-500" }
const MAX_THUMBS = 6

function review(leftOut: CardLeftOut) {
  leftOut.onReview(leftOut.open.needed.length > 0 ? "needed" : "look")
}

function PillPopover({ leftOut }: { leftOut: CardLeftOut }) {
  const { t } = useLingui()
  const ai = leftOut.aiAsked && !leftOut.aiRunning
  const shown = leftOut.checks.slice(0, MAX_THUMBS)
  const more = leftOut.checks.length - shown.length
  const count = leftOut.checks.length
  const title = ai
    ? leftOut.aiKeep > 0
      ? t`${plural(leftOut.aiKeep, { one: "The AI suggests bringing back # picture", other: "The AI suggests bringing back # pictures" })}`
      : leftOut.ai.unsure > 0
        ? t`${plural(leftOut.ai.unsure, { one: "The AI isn't sure about # picture", other: "The AI isn't sure about # pictures" })}`
        : t`The AI thinks these can stay out`
    : t`${plural(count, { one: "# left-out picture worth checking", other: "# left-out pictures worth checking" })}`
  return (
    <div className="flex flex-col gap-3 p-3" data-left-out-pill-popover>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t`Page ${leftOut.pageNumber}`}</p>
        <p className="text-[13.5px] leading-snug font-semibold">{title}</p>
        {ai ? (
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted-foreground tabular-nums">
            {(["keep", "unsure", "remove"] as const).map((verdict) =>
              leftOut.ai[verdict] > 0 ? (
                <span key={verdict} className="flex items-center gap-1">
                  <span aria-hidden className={cn("size-2 rounded-full", DOT[verdict])} />
                  {verdict === "keep" ? t`${leftOut.ai.keep} to bring back` : verdict === "unsure" ? t`${leftOut.ai.unsure} not sure` : t`${leftOut.ai.remove} fine to leave out`}
                </span>
              ) : null,
            )}
          </p>
        ) : (
          <p className="text-[12px] leading-snug text-muted-foreground">
            {leftOut.aiRunning ? <Trans>The AI is looking at them now.</Trans> : <Trans>Sectioning only uses the pictures you keep. Check them, or ask the AI for a second look from the banner.</Trans>}
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {shown.map(({ item, verdict }) => (
          <button
            key={item.key}
            type="button"
            onClick={() => leftOut.onOpenItem(item)}
            aria-label={t`Check picture ${item.number} on page ${leftOut.pageNumber}`}
            className="group relative block aspect-square rounded-lg outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)]"
          >
            <FilteredThumb paper label={leftOut.label} imageId={item.imageId} alt="" className="absolute inset-0 size-full rounded-lg p-1.5" />
            {verdict && <VerdictMark verdict={verdict} small />}
          </button>
        ))}
      </div>
      {more > 0 && <p className="-mt-1 text-[11.5px] text-muted-foreground tabular-nums">{t`+${more} more on this page`}</p>}
      {leftOut.kept > 0 && <p className="text-[11.5px] text-muted-foreground">{t`${plural(leftOut.kept, { one: "# picture on this page is already kept.", other: "# pictures on this page are already kept." })}`}</p>}
      <button
        type="button"
        onClick={() => review(leftOut)}
        className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--chrome-hex)] text-[12.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
      >
        {ai && leftOut.aiKeep > 0 ? <Trans>Check the AI's picks</Trans> : <Trans>Check this page</Trans>}
        <ArrowRight className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

function PillBadge({ leftOut, hex }: { leftOut: CardLeftOut; hex?: string }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useCloseOnScroll(open, close)
  const count = leftOut.checks.length
  if (count === 0) return leftOut.reviewed ? <ReviewedPill overImage /> : null
  const ai = leftOut.aiAsked && !leftOut.aiRunning
  const label = ai
    ? t`Page ${leftOut.pageNumber}: the AI suggests bringing back ${leftOut.aiKeep}`
    : t`${plural(count, { one: "# left-out picture worth checking", other: "# left-out pictures worth checking" })} on page ${leftOut.pageNumber}`
  const paint = (node: HTMLElement | null) => {
    if (node && hex) node.style.setProperty("--chrome-hex", hex)
  }
  return (
    <HoverCard openDelay={200} closeDelay={120} open={open} onOpenChange={(next) => setOpen(next ? hoverAllowed() : false)}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => review(leftOut)}
          aria-label={label}
          aria-haspopup="dialog"
          onFocus={() => setOpen(true)}
          className={cn(PILL, ai && leftOut.aiKeep > 0 ? "bg-emerald-600 text-white" : "bg-black/65 text-white")}
          data-left-out-pill={ai ? "ai" : "check"}
        >
          {leftOut.aiRunning ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden /> : ai ? <Sparkles className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
          {ai && leftOut.aiKeep > 0 ? leftOut.aiKeep : count}
        </button>
      </HoverCardTrigger>
      <HoverCardContent ref={paint} side="bottom" align="end" sideOffset={6} className="w-72">
        <PillPopover leftOut={leftOut} />
      </HoverCardContent>
    </HoverCard>
  )
}

export function CardTierOverlay({ leftOut, hex }: { leftOut: CardLeftOut | undefined; hex?: string }) {
  if (!leftOut) return null
  if (!leftOut.loading && leftOut.checks.length === 0 && !leftOut.reviewed) return null
  return (
    <span className="absolute top-2 right-2 z-10 flex items-center" data-left-out-card="badge">
      <Crossfade leftOut={leftOut} overImage>
        <PillBadge leftOut={leftOut} hex={hex} />
      </Crossfade>
    </span>
  )
}
