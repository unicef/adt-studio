import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SectionHeading } from "./shared"
import { MODES, EXTRAS } from "./data"

export function V5Tiles() {
  return (
    <>
      <SectionHeading
        title={<Trans>Every edition, fully accessible</Trans>}
        subtitle={<Trans>Five ways to read every page, plus the essentials.</Trans>}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m) => {
          const Icon = m.icon
          return (
            <div
              key={m.key}
              className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", m.solid)}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{m.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{m.blurb}</div>
              </div>
            </div>
          )
        })}
        <div className="flex flex-wrap content-center items-center gap-2 rounded-2xl border border-dashed bg-muted/30 p-3.5">
          {EXTRAS.map((e) => {
            const Icon = e.icon
            return (
              <span key={e.key} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground/80">
                <Icon className="size-3.5 text-muted-foreground" />
                {e.label}
              </span>
            )
          })}
        </div>
      </div>
    </>
  )
}
