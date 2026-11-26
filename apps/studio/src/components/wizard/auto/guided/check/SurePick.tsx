import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, ChevronDown } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { Screen } from "../shared/PreviewChoices"
import { screenPages, useDescribe, useScreenImages } from "../shared/screens/pages"
import { SCREEN } from "../shared/screens/layouts"
import { useBox } from "../shared/screens/useBox"
import type { Look } from "../shared/screens/look"
import { Morph } from "../Morph"
import { morph } from "../shared/motion"
import { useCheckLayout } from "../shared/checkLayout"

/** The book as it would come out with the current picks, on one of the user's pages. */
export function Picture({ rec, look, page, file, className }: { rec: SetupRecommendation; look: Look; page: number; file: File | null | undefined; className?: string }) {
  const pages = screenPages(rec, look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  const describe = useDescribe()
  const { ref, box } = useBox<HTMLSpanElement>()
  return (
    <span ref={ref} role="img" aria-label={describe(look, "desktop", pages)} className={cn("qd18-pv relative grid shrink-0 place-items-center overflow-hidden rounded-[12px]", className)}>
      {box.w > 0 && <Screen shown={look} srcs={srcs} width={fitWidth(box)} />}
    </span>
  )
}

/** The widest book screen (16:10) that fits a box with room around it. */
export function fitWidth(box: { w: number; h: number }): number {
  return Math.max(80, Math.min(box.w - 28, ((box.h - 28) * SCREEN.desktop.w) / SCREEN.desktop.h))
}

/** "I'm sure" on the engine's own pick, "Your pick" once the user changed it. */
export function PickBadge({ changed }: { changed: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--gd-step)] px-2 py-0.5 text-[11.5px] font-medium text-primary-foreground">
      <Check className="size-3 stroke-[3]" />
      {changed ? <Trans>Your pick</Trans> : <Trans>I&apos;m sure</Trans>}
    </span>
  )
}

/**
 * A pick the engine is sure of, highlighted (accent edge, the book as it would come out, a badge),
 * with its other options a tap away under "See the other options". Picking one of them closes the
 * options and shows it here as "Your pick"; the screen's button then moves on.
 */
export function SurePick({ picture, label, title, hint, result, changed, badge = true, labelId, open, onToggle, others, othersLabel, children }: { picture: ReactNode; label?: ReactNode; title: ReactNode; hint?: ReactNode; result?: ReactNode; changed: boolean; badge?: boolean; labelId: string; open: boolean; onToggle: () => void; others: boolean; othersLabel?: ReactNode; children?: ReactNode }) {
  const flat = useCheckLayout() !== "card"
  return (
    <div className={cn("flex flex-col gap-3 rounded-[18px]", flat ? "" : "gd-sure p-2.5 lg:p-3.5")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5 lg:gap-7">
        <div data-vt-pick={`pick-${labelId}`} className="shrink-0" style={{ viewTransitionName: `pick-${labelId}` }}>
          {picture}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 px-1.5 pb-1 sm:px-0 sm:pb-0 sm:pr-2">
          {label && (
            <span id={labelId} className="text-[13px] text-muted-foreground lg:text-[14.5px]">
              {label}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[18px] font-semibold leading-tight tracking-[-0.01em] lg:text-[22px]">{title}</span>
            {(badge || changed) && <PickBadge changed={changed} />}
          </span>
          {hint && <span className="text-[14px] leading-snug text-muted-foreground lg:text-[15.5px]">{hint}</span>}
          {result && <span className="text-[13.5px] leading-snug text-foreground/85 lg:text-[15px]">{result}</span>}
          {others && (
            <button type="button" aria-expanded={open} onClick={() => morph(onToggle)} className="lc-link -ml-1.5 mt-1 inline-flex min-h-9 items-center gap-1 px-1.5 text-[13.5px] font-medium">
              {open ? <Trans>Hide the other options</Trans> : (othersLabel ?? <Trans>See the other options</Trans>)}
              <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
      <Morph swap={String(open)} inner="">
        {open && <div className="px-0.5 pb-1">{children}</div>}
      </Morph>
    </div>
  )
}

/** The pick's picture area, sized for a screen: full width on a phone, beside the words from sm up. */
export const PICTURE = "h-[160px] w-full sm:h-[170px] sm:w-[270px] lg:h-[clamp(220px,32vh,360px)] lg:w-[clamp(340px,50vh,560px)]"
