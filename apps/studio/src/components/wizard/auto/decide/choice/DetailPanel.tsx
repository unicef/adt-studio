import { useId, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle, Check, Minus, Plus, Sparkles, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Option } from "../questions"
import { KindTag, useGlance } from "../strategies"
import { SWAP } from "../../../core/ui"

const EASE = "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"

export type PanelView = "overview" | "proscons"

function View({ id, active, fromLeft, children }: { id: string; active: boolean; fromLeft?: boolean; children: ReactNode }) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={`${id}-tab`}
      aria-hidden={!active}
      className={cn(
        "col-start-1 row-start-1 flex flex-col gap-3 transition-[opacity,transform,visibility]",
        EASE,
        active ? "visible translate-x-0 opacity-100" : cn("pointer-events-none invisible opacity-0", fromLeft ? "-translate-x-3" : "translate-x-3"),
      )}
    >
      {children}
    </div>
  )
}

/**
 * The selected strategy explained, in two tabs that share one fixed-size slot: Overview (what it
 * does, the four things people care about as a list, who it's for) and Pros & cons. Both views
 * are always laid out in the same grid cell, so switching crossfades without the panel — or the
 * preview beside it — changing size. The tab is owned by the caller so it stays put across looks.
 */
export function DetailPanel({ option, pick, view, onView, className }: { option: Option; pick?: number; view: PanelView; onView: (v: PanelView) => void; className?: string }) {
  const glance = useGlance(option.value)
  const uid = useId()
  const tabs: { id: PanelView; label: ReactNode }[] = [
    { id: "overview", label: <Trans>Overview</Trans> },
    { id: "proscons", label: <Trans>Pros &amp; cons</Trans> },
  ]

  return (
    <div data-decide-panel className={cn("flex flex-col gap-3 rounded-[26px] border bg-card/90 px-5 py-4 backdrop-blur", SWAP, className)}>
      <div className="flex flex-wrap items-center gap-2">
        <KindTag id={option.value} />
        {pick !== undefined && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            <Sparkles className="size-3" />
            {pick === 0 ? <Trans>AI pick 1</Trans> : <Trans>AI pick 2</Trans>}
          </span>
        )}
      </div>
      <div>
        <p className="text-[24px] font-bold leading-tight tracking-[-0.02em]">{option.title}</p>
        <p className="mt-0.5 text-[14px] font-medium text-brand-700">{option.tagline}</p>
      </div>

      <div role="tablist" className="relative grid grid-cols-2 rounded-full bg-muted p-1 text-[13px] font-semibold">
        <span aria-hidden className={cn("absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-card shadow-sm transition-transform", EASE, view === "proscons" && "translate-x-full")} />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${uid}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            aria-controls={`${uid}-${tab.id}`}
            onClick={() => onView(tab.id)}
            className={cn("relative h-8 rounded-full transition-colors duration-200", view === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid">
        <View id={`${uid}-overview`} active={view === "overview"} fromLeft>
          <p className="text-[13.5px] leading-snug text-foreground/80">{option.does}</p>
          <ul className="flex flex-col divide-y rounded-2xl bg-card ring-1 ring-border">
            {glance.map((g) => {
              const Icon = g.icon
              return (
                <li key={g.key} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 text-[13.5px] text-foreground/80">{g.label}</span>
                  <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[13.5px] font-semibold", g.good ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
                    <span className={cn("grid size-[18px] place-items-center rounded-full", g.good ? "bg-emerald-100 dark:bg-emerald-500/20" : "bg-amber-100 dark:bg-amber-500/20")}>{g.good ? <Check className="size-3 stroke-[3]" /> : <AlertTriangle className="size-3" />}</span>
                    {g.value}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex items-start gap-2.5 rounded-2xl bg-brand-50/70 px-3 py-2 ring-1 ring-brand-100">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <Target className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-muted-foreground">
                <Trans>Best for</Trans>
              </span>
              <span className="block text-[13.5px] font-semibold leading-snug text-brand-900">{option.bestFor}</span>
            </span>
          </div>
        </View>

        <View id={`${uid}-proscons`} active={view === "proscons"}>
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
              <Trans>What&apos;s great</Trans>
            </p>
            <ul className="flex flex-col divide-y rounded-2xl bg-card ring-1 ring-border">
              {option.pros.map((p, i) => (
                <li key={i} className="flex items-start gap-3 px-3.5 py-2.5 text-[13.5px] leading-snug text-foreground/85">
                  <span className="mt-px grid size-[18px] shrink-0 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    <Plus className="size-3 stroke-[3]" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
              <Trans>Keep in mind</Trans>
            </p>
            <ul className="flex flex-col divide-y rounded-2xl bg-card ring-1 ring-border">
              {option.cons.map((c, i) => (
                <li key={i} className="flex items-start gap-3 px-3.5 py-2.5 text-[13.5px] leading-snug text-foreground/85">
                  <span className="mt-px grid size-[18px] shrink-0 place-items-center rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    <Minus className="size-3 stroke-[3]" />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </View>
      </div>
    </div>
  )
}
