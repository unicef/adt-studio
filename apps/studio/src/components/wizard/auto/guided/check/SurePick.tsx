import { useEffect, useRef, useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, ChevronDown } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { PickedContext, useDetailsLook } from "../shared/detailsLook"
import { Screen } from "../shared/PreviewChoices"
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
 * A pick the engine is sure of, in one column: the picture across it, the question, the pick in
 * large type with its badge and line, and its other options a tap away. Opening them scrolls them
 * into view above the bottom bar; picking one closes them and shows it here as "Your pick".
 */
export function SurePick({ picture, label, title, hint, result, changed, badge = true, labelId, open, onToggle, others, othersLabel, hideLabel, accordion, children }: { picture: ReactNode; label?: ReactNode; title: ReactNode; hint?: ReactNode; result?: ReactNode; changed: boolean; badge?: boolean; labelId: string; open: boolean; onToggle: () => void; others: boolean; othersLabel?: ReactNode; hideLabel?: ReactNode; accordion?: boolean; children?: ReactNode }) {
  // How the other options show (lab variant). `accordion` keeps a screen on the accordion (Language: a field, not options).
  const chosenLook = useDetailsLook()
  const look = accordion ? "accordion" : chosenLook
  const inline = look === "switch" || look === "strip"
  const more = useRef<HTMLDivElement>(null)
  // Once the options have grown in, bring them into view (gently, above the bottom bar).
  // Once open, the options may spill out (a language list drops below its field); while they
  // grow or shrink they're clipped.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!open) return setSettled(false)
    const id = window.setTimeout(() => {
      setSettled(true)
      more.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, 320)
    return () => window.clearTimeout(id)
  }, [open])
  return (
    <div data-pick className="flex scroll-mt-24 flex-col gap-5">
      <div data-vt-pick={`pick-${labelId}`} className="w-full shrink-0 [&>*>*]:!h-[clamp(220px,34vh,360px)] [&>*>*]:!w-full" style={{ viewTransitionName: `pick-${labelId}` }}>
        <div key={typeof title === "string" ? title : undefined} className="gd-pick-in contents">
          {picture}
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2">
        {label && (
          <span id={labelId} className="text-[15px] text-muted-foreground lg:text-[16px]">
            {label}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[26px] font-semibold leading-tight tracking-[-0.02em] lg:text-[34px]">{title}</span>
          {(badge || changed) && <PickBadge changed={changed} />}
        </span>
        {hint && <span className="text-[15.5px] leading-snug text-muted-foreground lg:text-[17px]">{hint}</span>}
        {result && <span className="text-[13.5px] leading-snug text-foreground/85 lg:text-[15px]">{result}</span>}
        {others && inline && <div className="mt-2 w-full">{children}</div>}
        {others && look === "sheet" && (
          <button type="button" aria-haspopup="dialog" onClick={onToggle} className="lc-link -ml-1.5 mt-1 inline-flex min-h-9 items-center gap-1 px-1.5 text-[13.5px] font-medium">
            {othersLabel ?? <Trans>See the other options</Trans>}
            <ChevronDown className="size-3.5 -rotate-90" />
          </button>
        )}
        {others && look === "accordion" && (
          <button type="button" aria-expanded={open} onClick={onToggle} className="lc-link -ml-1.5 mt-1 inline-flex min-h-9 items-center gap-1 px-1.5 text-[13.5px] font-medium">
            {open ? (hideLabel ?? <Trans>Hide the other options</Trans>) : (othersLabel ?? <Trans>See the other options</Trans>)}
            <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
          </button>
        )}
      </div>
      {look === "sheet" && (
        <Dialog open={open} onOpenChange={(o) => o !== open && onToggle()}>
          <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="bottom-0 top-auto flex max-h-[80vh] max-w-[860px] translate-y-0 flex-col gap-3 overflow-y-auto rounded-b-none rounded-t-[22px] p-5 pt-6 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:rounded-b-none sm:rounded-t-[22px]">
            <DialogTitle className="pr-10 text-[17px] font-semibold">{label ?? <Trans>The other options</Trans>}</DialogTitle>
            <PickedContext.Provider value={onToggle}>{children}</PickedContext.Provider>
          </DialogContent>
        </Dialog>
      )}
      {/* The options grow in (height and fade), and shrink away when hidden; nothing else on the page moves. */}
      {look === "accordion" && (
      <div className={cn("gd-expand grid", open ? "grid-rows-[1fr] opacity-100" : "-mt-5 grid-rows-[0fr] opacity-0")} inert={!open}>
        <div className={cn("min-h-0", settled ? "overflow-visible" : "overflow-hidden")}>
          <div ref={more} className="scroll-mb-[150px] px-1 pb-2 pt-1">
            {children}
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

/** The pick's picture area, sized for a screen: full width on a phone, beside the words from sm up. */
export const PICTURE = "h-[160px] w-full sm:h-[170px] sm:w-[270px] lg:h-[clamp(220px,32vh,360px)] lg:w-[clamp(340px,50vh,560px)]"
