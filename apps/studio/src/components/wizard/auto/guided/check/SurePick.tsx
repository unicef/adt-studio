import { type CSSProperties, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { Screen } from "../shared/PreviewChoices"
import { CompactOptionsContext } from "../shared/optionsLayout"
import { swapName } from "../shared/motion"
import { screenPages, useDescribe, useScreenImages } from "../shared/screens/pages"
import { SCREEN } from "../shared/screens/layouts"
import { useBox } from "../shared/screens/useBox"
import type { Look } from "../shared/screens/look"

/** The book as it would come out with the current picks, on one of the user's pages. */
export function Picture({ rec, look, page, file, className }: { rec: SetupRecommendation; look: Look; page: number; file: File | null | undefined; className?: string }) {
  const pages = screenPages(rec, look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  const describe = useDescribe()
  const { ref, box } = useBox<HTMLSpanElement>()
  return (
    <span ref={ref} role="img" aria-label={describe(look, "desktop", pages)} className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[var(--lc-stage,var(--muted))]", className)}>
      {box.w > 0 && <Screen shown={look} srcs={srcs} width={fitWidth(box)} />}
    </span>
  )
}

/** The widest book screen (16:10) that fits a box with room around it. */
function fitWidth(box: { w: number; h: number }): number {
  return Math.max(80, Math.min(box.w - 28, ((box.h - 28) * SCREEN.desktop.w) / SCREEN.desktop.h))
}

/** "I'm sure" on the engine's own pick, "Your pick" once the user changed it. */
function PickBadge({ changed }: { changed: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--gd-step)] px-2 py-0.5 text-[11.5px] font-medium text-primary-foreground">
      <Check className="size-3 stroke-[3]" />
      {changed ? <Trans>Your pick</Trans> : <Trans>I&apos;m sure</Trans>}
    </span>
  )
}

/**
 * A pick the engine is sure of: the picture beside the words on a wide window (above them on a
 * phone), the question, the pick in large type with its badge and line, and under it every option
 * as a compact card, always in view, to pick another in one click (it then shows here as "Your
 * pick"). `pictureKey` keeps the picture mounted while the pick changes (it morphs instead of
 * popping in again).
 */
export function SurePick({ picture, pictureKey, label, title, hint, result, after, changed, badge = true, labelId, others, children }: { picture: ReactNode; pictureKey?: string; label?: ReactNode; after?: ReactNode; title: ReactNode; hint?: ReactNode; result?: ReactNode; changed: boolean; badge?: boolean; labelId: string; others: boolean; children?: ReactNode }) {
  return (
    <div data-pick className="flex flex-col gap-5">
      {/* On a wide window the picture stands beside the words, so the step fits without scrolling. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        {picture && (
          <div data-vt-pick={`pick-${labelId}`} className="w-full shrink-0 lg:w-[42%] [&>*>*]:!h-[max(120px,calc(clamp(170px,calc(var(--gd-vh,1vh)*30),360px)-var(--gd-squeeze,0px)))] [&>*>*]:!w-full lg:[&>*>*]:!h-[max(180px,calc(clamp(220px,calc(var(--gd-vh,1vh)*34),400px)-var(--gd-squeeze,0px)))]" style={{ viewTransitionName: `pick-${labelId}` }}>
            <div key={pictureKey ?? (typeof title === "string" ? title : undefined)} className="gd-pick-in contents">
              {picture}
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2" style={{ viewTransitionName: `${labelId}-words` }}>
          {label && (
            <span id={labelId} className="text-[15px] text-muted-foreground lg:text-[16px]">
              {label}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2" style={{ viewTransitionName: swapName(`${labelId}-title`, typeof title === "string" ? title : ""), viewTransitionClass: "gd-swap gd-swap-start" } as CSSProperties}>
            <span className="gd-pick-title text-[26px] font-semibold leading-tight tracking-[-0.02em] lg:text-[32px]">{title}</span>
            {(badge || changed) && <PickBadge changed={changed} />}
          </span>
          {hint && <span className="text-[15.5px] leading-snug text-muted-foreground lg:text-[16.5px]">{hint}</span>}
          {result && <span className="text-[13.5px] leading-snug text-foreground/85 lg:text-[14.5px]">{result}</span>}
        </div>
      </div>
      {/* The words and what comes after have their own names, so when the page shifts they slide rather than fade between two places. */}
      {after && (
        <div className="-mt-1 w-full" style={{ viewTransitionName: `${labelId}-after` }}>
          {after}
        </div>
      )}
      {/* Every option, always in view as compact cards. */}
      {others && (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground/60">
            <Trans>Other options</Trans>
          </span>
          <CompactOptionsContext.Provider value="others">{children}</CompactOptionsContext.Provider>
        </div>
      )}
    </div>
  )
}

/** The pick's picture area, sized for a screen: full width on a phone, beside the words from sm up. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- Tailwind classes, never shown
export const PICTURE = "h-[160px] w-full sm:h-[170px] sm:w-[270px] lg:h-[max(120px,calc(clamp(220px,calc(var(--gd-vh,1vh)*32),360px)-var(--gd-squeeze,0px)))] lg:w-[clamp(340px,calc(var(--gd-vh,1vh)*50),560px)]"
