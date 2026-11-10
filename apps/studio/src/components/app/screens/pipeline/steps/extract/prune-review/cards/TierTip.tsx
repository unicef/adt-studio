import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Check, ImageMinus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { whyText, type Tier } from "../tier"
import { capCount, TIER_ICON, TIER_LABEL, TIER_OVER_IMAGE, TIER_TEXT } from "../tierTone"
import { visibleTiers, type CardLeftOut } from "./cardModel"

const TIP_DELAY = 300

export function TierTipContent({ leftOut }: { leftOut: CardLeftOut }) {
  const { i18n } = useLingui()
  const tiers = visibleTiers(leftOut)
  const top = tiers[0]
  const whys = top ? [...new Set(leftOut.open[top].map((entry) => whyText((descriptor) => i18n._(descriptor), entry.rank)).filter(Boolean))].slice(0, 2) : []
  return (
    <div className="flex max-w-64 flex-col gap-1 py-0.5 text-left" data-tier-tip>
      {tiers.map((tier) => {
        const Icon = TIER_ICON[tier]
        return (
          <div key={tier} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon className="size-3 shrink-0" aria-hidden />
              {i18n._(TIER_LABEL[tier])} ({leftOut.open[tier].length})
            </span>
            {tier === top && whys.map((why) => <span key={why} className="pl-[18px] leading-snug opacity-85">{why}</span>)}
          </div>
        )
      })}
    </div>
  )
}

export function useTierAria() {
  const { t } = useLingui()
  return (pageNumber: number, tier: Tier, count: number) => {
    if (tier === "needed") return t`Page ${pageNumber}: ${plural(count, { one: "# probably needed", other: "# probably needed" })}. Review`
    if (tier === "look") return t`Page ${pageNumber}: ${plural(count, { one: "# worth a look", other: "# worth a look" })}. Review`
    return t`Page ${pageNumber}: ${plural(count, { one: "# probably right to leave out", other: "# probably right to leave out" })}. Review`
  }
}

export const TIER_FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)] focus-visible:ring-offset-2 focus-visible:ring-offset-card"

export function TierTrigger({ leftOut, tier, className, children }: { leftOut: CardLeftOut; tier: Tier; className?: string; children: ReactNode }) {
  const aria = useTierAria()
  const count = leftOut.open[tier].length
  return (
    <Tooltip delayDuration={TIP_DELAY}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            leftOut.onReview(tier)
          }}
          aria-label={aria(leftOut.pageNumber, tier, count)}
          data-tier-badge={tier}
          className={cn("relative z-10 cursor-pointer", TIER_FOCUS, className)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <TierTipContent leftOut={leftOut} />
      </TooltipContent>
    </Tooltip>
  )
}

export function OverImagePill({ leftOut, tier }: { leftOut: CardLeftOut; tier: Tier }) {
  const Icon = TIER_ICON[tier]
  return (
    <TierTrigger
      leftOut={leftOut}
      tier={tier}
      className={cn(
        "flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums shadow-sm ring-1 ring-white/70 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-md motion-reduce:transition-none dark:ring-black/50",
        TIER_OVER_IMAGE[tier],
      )}
    >
      <Icon className="size-3" strokeWidth={2.6} aria-hidden />
      {capCount(leftOut.open[tier].length)}
    </TierTrigger>
  )
}

export function TierCountText({ leftOut, tier }: { leftOut: CardLeftOut; tier: Tier }) {
  const Icon = TIER_ICON[tier]
  return (
    <span className={cn("flex items-center gap-0.5", TIER_TEXT[tier])}>
      <Icon className="size-3" strokeWidth={2.4} aria-hidden />
      {capCount(leftOut.open[tier].length)}
    </span>
  )
}

export function LoadingChip({ count, overImage, ready }: { count: number; overImage: boolean; ready: boolean }) {
  const { t } = useLingui()
  return (
    <span
      aria-hidden={ready}
      data-left-out-loading={ready ? undefined : count}
      className={cn(
        "flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10.5px] font-semibold whitespace-nowrap tabular-nums transition-opacity duration-200 motion-reduce:transition-none",
        overImage ? "bg-black/65 text-white" : "bg-muted text-muted-foreground",
        ready ? "pointer-events-none absolute top-0 right-0 opacity-0" : "animate-pulse motion-reduce:animate-none",
      )}
    >
      <ImageMinus className="size-3" aria-hidden />
      {t`${capCount(count)} left out`}
    </span>
  )
}

export function ReviewedPill({ overImage }: { overImage: boolean }) {
  const { t } = useLingui()
  return (
    <span
      role="img"
      aria-label={t`Left-out images on this page reviewed`}
      title={t`You went through the left-out images on this page`}
      data-left-out-reviewed
      className={cn(
        "relative z-10 flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10.5px] font-semibold whitespace-nowrap",
        overImage ? "bg-slate-700/90 text-white ring-1 ring-white/60 dark:bg-slate-800/90 dark:ring-black/50" : "bg-slate-500/12 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
      )}
    >
      <Check className="size-3" strokeWidth={2.6} aria-hidden />
      {t`Reviewed`}
    </span>
  )
}

export function Crossfade({ leftOut, overImage, className, children }: { leftOut: CardLeftOut; overImage: boolean; className?: string; children: ReactNode }) {
  const ready = !leftOut.loading
  return (
    <span className={cn("relative flex items-center", className)}>
      <LoadingChip count={leftOut.pending} overImage={overImage} ready={ready} />
      {ready && <span className="flex items-center gap-1 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none">{children}</span>}
    </span>
  )
}
