/* eslint-disable lingui/no-unlocalized-strings -- dev-only demo page for developers, never shown to users */
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../../core/pdf/usePageThumb"

export function Card({ step, title, kind, children, className, aside }: { step?: string; title: string; kind?: "measure" | "ai" | "rules" | "user"; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl bg-card p-5 ring-1 ring-border", className)}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          {step && <span className="grid size-7 place-items-center rounded-full bg-foreground text-[12px] font-bold text-background">{step}</span>}
          <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
          {kind && <Kind kind={kind} />}
        </div>
        {aside}
      </header>
      {children}
    </section>
  )
}

function Kind({ kind }: { kind: "measure" | "ai" | "rules" | "user" }) {
  const map = {
    measure: ["No AI · mupdf", "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300"],
    ai: ["AI call", "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"],
    rules: ["No AI · fixed rules", "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"],
    user: ["User", "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"],
  } as const
  const [label, cls] = map[kind]
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>
}

export function Tag({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "good" | "warn" | "bad" | "info" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-semibold",
        tone === "plain" && "bg-muted text-foreground",
        tone === "good" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
        tone === "warn" && "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        tone === "bad" && "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
        tone === "info" && "bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200",
      )}
    >
      {children}
    </span>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5" title={hint}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}

/** A page of the PDF, or just its number when the PDF isn't loaded (saved answers). */
export function Page({ file, page, width = 72, label, tone }: { file: File | null; page: number; width?: number; label?: ReactNode; tone?: string }) {
  const src = usePageThumb(file, page, width)
  return (
    <figure className="flex shrink-0 flex-col items-center gap-1" style={{ width }}>
      <div className={cn("grid w-full place-items-center overflow-hidden rounded-md bg-muted ring-1 ring-border", tone)} style={{ height: Math.round(width * 1.35) }}>
        {src ? <img src={src} alt={`Page ${page}`} className="max-h-full max-w-full" /> : <span className="text-[12px] font-semibold text-muted-foreground">p. {page}</span>}
      </div>
      <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
        <span className="tabular-nums">p. {page}</span>
        {label && <div className="font-semibold text-foreground">{label}</div>}
      </figcaption>
    </figure>
  )
}

export function Pages({ file, pages, width }: { file: File | null; pages: number[]; width?: number }) {
  if (!pages.length) return <span className="text-[12px] text-muted-foreground">none</span>
  return (
    <div className="flex flex-wrap gap-2">
      {pages.map((p) => (
        <Page key={p} file={file} page={p} width={width} />
      ))}
    </div>
  )
}

export const ms = (n: number | null | undefined) => (n == null ? "—" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`)
export const num = (n: number) => n.toLocaleString()

/** The wizard's own names for the settings and their values. */
export const WIZARD_NAME: Record<string, string> = {
  preset: "Preset",
  renderStrategy: "Render Strategy",
  pageGrouping: "Page Grouping",
  sectioningMode: "Section Mode",
  activitiesGenerator: "Activities",
  figureExtraction: "Figure Extraction",
}
const WIZARD_VALUE: Record<string, Record<string, string>> = {
  preset: { textbook: "Textbooks & Activities", storybook: "Storybook", reference: "Reference" },
  renderStrategy: { llm: "Dynamic", "llm-overlay": "Dynamic Overlay", single_column: "Single Column", two_column_story: "Two Columns Story", fixed_layout: "Fixed Layout" },
  pageGrouping: { single: "Single Page", spread: "Spread" },
  sectioningMode: { page: "Per Page", dynamic: "Dynamic" },
  activitiesGenerator: { true: "On", false: "Off" },
  figureExtraction: { off: "Off", auto: "Auto" },
}
export const wizardValue = (id: string, v: unknown) => WIZARD_VALUE[id]?.[String(v)] ?? String(v)
