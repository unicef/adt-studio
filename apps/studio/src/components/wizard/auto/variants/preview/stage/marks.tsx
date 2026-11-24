import type { CSSProperties, ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, Image as ImageIcon, Sparkles, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useArtBox } from "./useArtBox"

/**
 * The pieces every preview layout is drawn from, at the device's "real" size (a 1024px computer
 * screen, a 390px phone). Words are drawn as lines on purpose: the preview shows where things go,
 * not the converted text.
 */

const WIDTHS = [94, 82, 90, 68, 86, 74, 92, 60]

export function Lines({ n, big, center, className }: { n: number; big?: boolean; center?: boolean; className?: string }) {
  return (
    <div className={cn("flex w-full flex-col", big ? "gap-4" : "gap-[11px]", center && "items-center", className)}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn("block rounded-full bg-slate-300", big ? "h-[15px]" : "h-[9px]")} style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }} />
      ))}
    </div>
  )
}

export function HeadingBar({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <span className="block h-[20px] w-[58%] rounded-full bg-slate-800" />
      <span className="block h-[9px] w-[34%] rounded-full bg-slate-400" />
    </div>
  )
}

/** The figure tag and dashed outline Figure Extraction draws around a picture and its labels. */
export function FigureMark({ box }: { box?: { x: number; y: number; w: number; h: number } }) {
  const style: CSSProperties = box ? { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` } : { inset: 10 }
  return (
    <span aria-hidden className="pointer-events-none absolute animate-[am-pop_0.35s_cubic-bezier(0.34,1.56,0.64,1)_both] rounded-[14px] border-[3px] border-dashed border-violet-500/90 motion-reduce:animate-none" style={style}>
      <span className="absolute -bottom-[15px] left-3 inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1 text-[15px] font-semibold text-white shadow-md">
        <ImageIcon className="size-4" />
        <Trans>Figure + labels</Trans>
      </span>
    </span>
  )
}

/**
 * The page's picture as a template places it: the page cropped to its artwork. Two pages (a
 * spread) sit side by side so the picture stays whole.
 */
export function Pic({ srcs, figures, className }: { srcs: (string | undefined)[]; figures?: boolean; className?: string }) {
  const box = useArtBox(srcs.length === 1 ? srcs[0] : undefined)
  const view = srcs.length === 1 ? [box.y, 1 - box.x - box.w, 1 - box.y - box.h, box.x].map((n) => `${n * 100}%`).join(" ") : undefined
  return (
    <div className={cn("relative overflow-visible", className)}>
      <div className="absolute inset-0 flex overflow-hidden rounded-[inherit] bg-gradient-to-br from-blue-100 to-blue-200">
        {srcs.map((src, i) =>
          src ? <img key={i} src={src} alt="" className="h-full min-w-0 flex-1 object-cover" style={view ? ({ objectViewBox: `inset(${view})` } as CSSProperties) : undefined} /> : <span key={i} className="flex-1" />,
        )}
      </div>
      {figures && <FigureMark />}
    </div>
  )
}

export function Speaker() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-700">
      <Volume2 className="size-4" />
    </span>
  )
}

/** A box of rebuilt, readable words, as Dynamic Overlay lays them over the page picture. */
export function WordBox({ className, style, lines = 2 }: { className?: string; style?: CSSProperties; lines?: number }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl bg-white/95 p-4 shadow-[0_6px_22px_rgba(15,23,42,0.22)] ring-1 ring-black/5", className)} style={style}>
      <Speaker />
      <Lines n={lines} className="mt-1.5" />
    </div>
  )
}

/** An interactive activity made from the book's exercises. */
export function ActivityCard({ compact }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4">
      <p className="flex items-center gap-1.5 text-[14px] font-bold uppercase tracking-[0.08em] text-blue-700">
        <Sparkles className="size-4" />
        <Trans>Activity</Trans>
      </p>
      <span className="mt-2.5 block h-[11px] w-[70%] rounded-full bg-slate-700" />
      <div className={cn("mt-3.5 grid gap-2.5", compact ? "grid-cols-1" : "grid-cols-3")}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("flex items-center gap-2.5 rounded-xl border-2 bg-white px-3 py-2.5", i === 1 ? "border-emerald-400" : "border-slate-200")}>
            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", i === 1 ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300")}>{i === 1 && <Check className="size-3 stroke-[3]" />}</span>
            <span className="block h-[8px] flex-1 rounded-full bg-slate-300" style={{ maxWidth: `${[70, 55, 80][i]}%` }} />
          </span>
        ))}
      </div>
    </div>
  )
}

/** One section of a page when Section Mode is Dynamic: a dashed outline (no tag, to keep the preview quiet). Plain wrapper otherwise. */
export function Part({ n, on, children, className }: { n: number; on: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {children}
      {on && (
        <span aria-hidden className="pointer-events-none absolute -inset-2.5 animate-[am-pop_0.35s_cubic-bezier(0.34,1.56,0.64,1)_both] rounded-[18px] border-[3px] border-dashed border-amber-500 motion-reduce:animate-none" style={{ animationDelay: `${n * 80}ms` }}>
        </span>
      )}
    </div>
  )
}
