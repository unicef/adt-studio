import { useLingui, Trans } from "@lingui/react/macro"
import { CAPABILITY_GROUPS } from "./capabilities"

export function SecondRowGrouped() {
  const { i18n } = useLingui()
  return (
    <>
      <div className="mb-3 mt-[22px] flex items-baseline gap-2.5">
        <span className="text-[15px] font-bold">
          <Trans>What ADT Studio does</Trans>
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          <Trans>every stage runs in your library</Trans>
        </span>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {CAPABILITY_GROUPS.map((g, gi) => (
          <div key={gi}>
            <div className="mb-3 border-b pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {i18n._(g.label)}
            </div>
            <div className="space-y-3.5">
              {g.items.map((c, i) => {
                const Icon = c.icon
                return (
                  <div key={i} className="flex gap-2.5">
                    <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${c.tint}`}>
                      <Icon className="size-3.5" />
                    </span>
                    <div>
                      <div className="text-[12.5px] font-semibold">{i18n._(c.title)}</div>
                      <div className="text-[11px] leading-snug text-muted-foreground">{i18n._(c.blurb)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
