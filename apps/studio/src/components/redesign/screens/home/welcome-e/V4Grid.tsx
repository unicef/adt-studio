import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SectionHeading } from "./shared"
import { ALL_FEATURES } from "./data"

export function V4Grid() {
  return (
    <>
      <SectionHeading
        title={<Trans>Every edition, fully accessible</Trans>}
        subtitle={<Trans>Nine things every book gains, from one source PDF.</Trans>}
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        {ALL_FEATURES.map((f) => {
          const Icon = f.icon
          return (
            <div key={f.key} className="flex items-start gap-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", f.soft)}>
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{f.label}</div>
                <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{f.blurb}</div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
