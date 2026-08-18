import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SectionHeading } from "./shared"
import { MODES, EXTRAS } from "./data"

const PAGE = "bg-[oklch(0.985_0.006_85)] text-[oklch(0.29_0.02_265)]"

export function V2Reader() {
  return (
    <>
      <SectionHeading
        title={<Trans>Every edition, fully accessible</Trans>}
        subtitle={<Trans>Open any page and switch how you take it in — no extra work.</Trans>}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border bg-muted/40 p-4">
          <div className={cn("overflow-hidden rounded-xl shadow-[0_18px_50px_-24px_rgba(20,22,40,0.4)]", PAGE)}>
            <div className="flex items-center gap-1.5 border-b border-[oklch(0.9_0.01_85)] px-3 py-2">
              {MODES.map((m) => {
                const Icon = m.icon
                return (
                  <span key={m.key} className={cn("grid size-7 place-items-center rounded-lg", m.soft)} title="">
                    <Icon className="size-4" />
                  </span>
                )
              })}
              <span className="ml-auto text-[10px] font-medium text-[oklch(0.55_0.02_265)]">
                <Trans>Water &amp; Weather · Grade 4</Trans>
              </span>
            </div>
            <div className="px-5 py-4">
              <div className="text-[15px] font-semibold">
                <Trans>The Water Cycle</Trans>
              </div>
              <div className="mt-2 space-y-1.5" aria-hidden>
                <span className="block h-2 w-[92%] rounded-full bg-[oklch(0.91_0.01_85)]" />
                <span className="block h-2 w-full rounded-full bg-[oklch(0.91_0.01_85)]" />
                <span className="block h-2 w-[78%] rounded-full bg-[oklch(0.91_0.01_85)]" />
              </div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[oklch(0.95_0.01_255)] px-2.5 py-1.5 text-[11px] font-medium text-[oklch(0.45_0.03_255)]">
                <span className="size-1.5 rounded-full bg-stage-speech" />
                <Trans>Narrating page 1 of 42</Trans>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <div className="text-[13px] font-semibold">
            <Trans>Read it your way</Trans>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            <Trans>Listen, simplify, translate, sign, or caption any page. Plus everything below, built in.</Trans>
          </p>
          <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
            {EXTRAS.map((e) => {
              const Icon = e.icon
              return (
                <div key={e.key} className="flex items-center gap-2.5">
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", e.soft)}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="text-[12.5px] font-medium">{e.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
