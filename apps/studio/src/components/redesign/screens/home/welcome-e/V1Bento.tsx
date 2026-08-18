import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SectionHeading } from "./shared"
import { MODES, EXTRAS } from "./data"

const BARS = [10, 18, 13, 22, 16, 24, 14, 20, 12]

export function V1Bento() {
  const [hero, ...rest] = MODES
  const HeroIcon = hero.icon
  return (
    <>
      <SectionHeading
        title={<Trans>Every edition, fully accessible</Trans>}
        subtitle={<Trans>Readers choose how they take in each page — you generate it once.</Trans>}
      />
      <div className="grid grid-cols-4 gap-3">
        <div className={cn("relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-2xl p-5", hero.solid)}>
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15">
              <HeroIcon className="size-5" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
              <Trans>Flagship</Trans>
            </span>
          </div>
          <div className="flex h-9 items-end gap-1" aria-hidden>
            {BARS.map((h, i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-white/80 motion-safe:animate-[eq_1s_ease-in-out_infinite]"
                style={{ height: `${h}px`, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <div>
            <div className="text-[17px] font-bold">{hero.label}</div>
            <div className="mt-0.5 text-[12px] leading-relaxed text-white/80">{hero.blurb}</div>
          </div>
        </div>

        {rest.map((m) => {
          const Icon = m.icon
          return (
            <div key={m.key} className="col-span-1 flex flex-col rounded-2xl border bg-card p-3.5">
              <div className={cn("mb-2 grid size-8 place-items-center rounded-lg", m.soft)}>
                <Icon className="size-[17px]" />
              </div>
              <div className="text-[13px] font-semibold">{m.label}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {EXTRAS.map((e) => {
          const Icon = e.icon
          return (
            <span key={e.key} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground/80">
              <Icon className="size-3.5 text-muted-foreground" />
              {e.label}
            </span>
          )
        })}
      </div>
    </>
  )
}
