import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"
import "../../../../core/flow.css"

export type Side = "left" | "right" | "single"

/** Renders a page ahead of time so the next turn has its picture ready. */
export function Warm({ file, page, width }: { file: File; page: number; width: number }) {
  usePageThumb(file, page, width)
  return null
}

/** The inside of the cover, where there is no page (left of page 1, right of an odd last page). */
export function Endpaper({ side }: { side: Side }) {
  return <div aria-hidden className={cn("size-full bg-[#e9e2d2] dark:bg-[#d9d0bd]", side === "left" ? "rounded-l-[3px]" : "rounded-r-[3px]")} />
}

/**
 * One sheet of the open book: the real PDF page on paper, with the curve and shade toward the
 * binding. `overlay` sits on top (the notes' flags); `lit` rings the page a note points to.
 */
export function Page({ file, page, side, width, lit, overlay, className }: { file: File; page: number | null; side: Side; width: number; lit?: boolean; overlay?: ReactNode; className?: string }) {
  const { t } = useLingui()
  const src = usePageThumb(file, page ?? 0, width)
  if (page === null) return <Endpaper side={side} />
  const curve = side === "left" ? "am-curve-left rounded-l-[3px]" : side === "right" ? "am-curve-right rounded-r-[3px]" : "am-curve-single rounded-r-[3px]"
  const shade =
    side === "left"
      ? "right-0 bg-[linear-gradient(to_left,rgba(60,45,20,0.34),rgba(60,45,20,0.1)_22%,rgba(255,255,255,0.2)_48%,transparent_85%)]"
      : "left-0 bg-[linear-gradient(to_right,rgba(60,45,20,0.34),rgba(60,45,20,0.1)_22%,rgba(255,255,255,0.2)_48%,transparent_85%)]"
  return (
    <div className={cn("relative size-full", className)}>
      <div className={cn("am-paper relative size-full overflow-hidden", curve)}>
        {src ? (
          <img src={src} alt={t`Page ${page}`} className="size-full object-contain mix-blend-multiply" draggable={false} />
        ) : (
          <div role="img" aria-label={t`Page ${page}`} className="flex size-full flex-col gap-[5%] p-[12%]">
            {[70, 90, 80, 60, 85, 75].map((w, i) => (
              <span key={i} className="h-[3%] rounded-full bg-stone-200 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 w-[26%]", shade)} />
        <span aria-hidden className={cn("absolute bottom-1.5 rounded-sm bg-white/80 px-1 font-mono text-[10px] font-medium text-stone-500", side === "left" ? "right-3" : "left-3")}>
          {page}
        </span>
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-[inherit] ring-[3px] ring-inset ring-brand-500/70 transition-opacity duration-300", lit ? "opacity-100" : "opacity-0")} />
      </div>
      {overlay}
    </div>
  )
}
