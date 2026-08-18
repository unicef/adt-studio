import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SectionHeading } from "./shared"
import { MODES, EXTRAS } from "./data"

export function V3Switcher() {
  const [active, setActive] = useState(0)
  const mode = MODES[active]
  const Icon = mode.icon
  return (
    <>
      <SectionHeading
        title={<Trans>Every edition, fully accessible</Trans>}
        subtitle={<Trans>One book, five ways to read it — pick one to preview.</Trans>}
      />
      <div className="rounded-2xl border bg-card p-2">
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/60 p-1.5">
          {MODES.map((m, i) => {
            const MIcon = m.icon
            const on = i === active
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={on}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                  on ? "bg-card text-foreground shadow-sm ring-1 ring-border dark:bg-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("grid size-5 place-items-center rounded-md", on ? m.solid : "text-muted-foreground")}>
                  <MIcon className="size-3.5" />
                </span>
                {m.label}
              </button>
            )
          })}
        </div>

        <div key={mode.key} className="flex items-center gap-4 p-5 motion-safe:animate-content-in">
          <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl", mode.solid)}>
            <Icon className="size-7" />
          </span>
          <div>
            <div className="text-[16px] font-bold">{mode.label}</div>
            <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{mode.blurb}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          <Trans>Also included</Trans>
        </span>
        {EXTRAS.map((e) => {
          const EIcon = e.icon
          return (
            <span key={e.key} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground/80">
              <EIcon className="size-3.5 text-muted-foreground" />
              {e.label}
            </span>
          )
        })}
      </div>
    </>
  )
}
