import { Trans } from "@lingui/react/macro"
import { BookOpen, Check, Columns2, Files, LayoutTemplate, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SampledPage } from "./useSampledPages"

const FAN = [
  { placeClassName: "left-0 top-[8%] z-0", restClassName: "-rotate-[9deg] group-hover:-translate-x-1.5 group-hover:-rotate-[11deg]", selectedClassName: "-translate-x-4 -rotate-[15deg]" },
  { placeClassName: "left-1/2 top-0 z-10 -translate-x-1/2", restClassName: "group-hover:-translate-y-1", selectedClassName: "-translate-y-2" },
  { placeClassName: "right-0 top-[8%] z-20", restClassName: "rotate-[8deg] group-hover:translate-x-1.5 group-hover:rotate-[10deg]", selectedClassName: "translate-x-4 rotate-[14deg]" },
]

function SketchPage() {
  return (
    <div className="flex size-full flex-col gap-[8%] bg-card p-[10%]">
      <div className="h-[46%] rounded-[4px] bg-gradient-to-br from-brand-50 to-brand-100" />
      <div className="h-[6%] w-[85%] rounded-full bg-border" />
      <div className="h-[6%] w-[70%] rounded-full bg-border" />
      <div className="h-[6%] w-[78%] rounded-full bg-border" />
    </div>
  )
}

/** The book's own pages (start, middle, end) fanned out: a hint of a spread on hover, fully spread when selected. */
function PageFan({ pages, loading, selected }: { pages: SampledPage[]; loading: boolean; selected?: boolean }) {
  const landscape = (pages[0]?.aspect ?? 0.75) > 1.05
  return (
    <div className="relative h-[124px] w-[250px]">
      {loading && pages.length === 0 && <div aria-hidden className="absolute inset-x-[40px] inset-y-1 rounded-xl bg-card/60 motion-safe:animate-pulse" />}
      {!(loading && pages.length === 0) && (
        <div className={cn("absolute inset-y-0", landscape ? "inset-x-0" : "inset-x-[25px]")}>
          {FAN.map((f, i) => {
            const page = pages[i]
            return (
              <div key={i} className={cn("absolute", f.placeClassName)}>
                <div
                  className={cn(
                    "overflow-hidden rounded-md border-[3px] border-white bg-card shadow-[0_10px_22px_rgba(15,23,42,0.16)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    landscape ? "h-[80px] w-[114px]" : "h-[112px] w-[84px]",
                    selected ? f.selectedClassName : f.restClassName,
                    !page && loading && "animate-pulse",
                  )}
                >
                  {page ? <img src={page.src} alt="" className="size-full object-cover motion-safe:animate-content-in" /> : <SketchPage />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** The AI mark next to the option title: a labelled gradient pill; `pulse` rings once when it (re)appears selected. */
export function AiPill({ pulse, muted }: { pulse?: boolean; muted?: boolean }) {
  return (
    <span className="relative inline-flex">
      {pulse && <span className="absolute inset-0 rounded-full bg-brand-500/40 animate-[am-pulse-once_0.9s_ease-out_both] motion-reduce:hidden" />}
      <span className={cn("relative inline-flex h-7 items-center gap-1 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 pl-2 pr-2.5 text-[12.5px] font-bold tracking-[0.02em] text-primary-foreground shadow-[0_6px_16px_rgba(43,127,255,0.4)] transition-[filter] duration-300", muted && "grayscale")}>
        <Sparkles className="size-3.5" />
        <Trans>AI</Trans>
      </span>
    </span>
  )
}

const CHIPS = [
  { key: "type", icon: BookOpen, toneClassName: "bg-stage-toc/10 text-stage-toc", label: <Trans>Book type</Trans>, delay: 0 },
  { key: "layout", icon: LayoutTemplate, toneClassName: "bg-stage-storyboard/10 text-stage-storyboard", label: <Trans>Page look</Trans>, delay: -2 },
  { key: "pages", icon: Columns2, toneClassName: "bg-stage-translate/10 text-stage-translate", label: <Trans>Pages</Trans>, delay: -4 },
]

/** Auto: the book's own pages and what the AI picks listed beside them (ticked once selected). */
export function AutoScene({ pages, loading, disabled, selected }: { pages: SampledPage[]; loading: boolean; disabled?: boolean; selected?: boolean }) {
  return (
    <div aria-hidden className={cn("relative flex h-full items-center justify-center gap-8 overflow-hidden bg-gradient-to-br from-brand-50 via-brand-50 to-brand-100 pl-6 pr-14 transition-[filter] duration-300", disabled && "grayscale")}>
      <div className="absolute inset-0 bg-[radial-gradient(var(--brand-200)_1px,transparent_1px)] [background-size:18px_18px] opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />
      <div className="relative">
        <PageFan pages={pages} loading={loading} selected={selected} />
      </div>
      <div className="relative flex shrink-0 flex-col items-start gap-2.5">
        {CHIPS.map(({ key, icon: Icon, toneClassName, label, delay }, i) => (
          <span
            key={key}
            style={{ animationDelay: `${delay}s`, transitionDelay: `${i * 60}ms` }}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1 pr-2.5 text-[12px] font-semibold shadow-[0_2px_10px_rgba(15,23,42,0.1)] ring-1 transition-[transform,background-color,box-shadow] duration-300 ease-out motion-safe:animate-float-y",
              selected ? "translate-x-1 bg-card ring-brand-200" : "bg-card ring-transparent group-hover:translate-x-0.5",
            )}
          >
            <span className="relative grid size-5 place-items-center">
              <span style={{ transitionDelay: `${i * 60}ms` }} className={cn("absolute inset-0 grid place-items-center rounded-full transition-[opacity,transform] duration-300", toneClassName, selected ? "scale-50 opacity-0" : "scale-100 opacity-100")}>
                <Icon className="size-3" />
              </span>
              <span style={{ transitionDelay: `${i * 60}ms` }} className={cn("absolute inset-0 grid place-items-center rounded-full bg-brand-600 text-primary-foreground transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", selected ? "scale-100 opacity-100" : "scale-50 opacity-0")}>
                <Check className="size-3 stroke-[3]" />
              </span>
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

const TOGGLES = [
  { key: "a", icon: Files, toneClassName: "bg-stage-sectioning/10 text-stage-sectioning", barClassName: "w-[52%]", on: true },
  { key: "b", icon: BookOpen, toneClassName: "bg-stage-quizzes/10 text-stage-quizzes", barClassName: "w-[38%]", on: false },
  { key: "c", icon: LayoutTemplate, toneClassName: "bg-stage-storyboard/10 text-stage-storyboard", barClassName: "w-[60%]", on: true },
]

/** Manual: a tidy settings panel; the off switch hints on hover and flips on (in blue) once selected. */
export function ManualScene({ selected }: { selected?: boolean }) {
  return (
    <div aria-hidden className={cn("relative grid h-full place-items-center overflow-hidden bg-gradient-to-br transition-colors duration-300", selected ? "from-brand-50 to-brand-100/70" : "from-muted/70 to-muted")}>
      <div className={cn("w-[66%] rounded-xl bg-card p-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", selected ? "-translate-y-1.5" : "group-hover:-translate-y-0.5")}>
        <div className="flex flex-col gap-3">
          {TOGGLES.map(({ key, icon: Icon, toneClassName, barClassName, on }, i) => {
            const active = on || selected
            return (
              <div key={key} className="flex items-center gap-2.5">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", toneClassName)}>
                  <Icon className="size-3.5" />
                </span>
                <span className={cn("h-1.5 rounded-full bg-border", barClassName)} />
                <span style={{ transitionDelay: `${i * 60}ms` }} className={cn("relative ml-auto h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-300", active ? (selected ? "bg-brand-600" : "bg-foreground/80") : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50")}>
                  <span style={{ transitionDelay: `${i * 60}ms` }} className={cn("absolute top-0.5 size-3.5 rounded-full bg-card shadow-sm transition-[left] duration-300 ease-out", active ? "left-[14px]" : "left-0.5 group-hover:left-[4px]")} />
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
