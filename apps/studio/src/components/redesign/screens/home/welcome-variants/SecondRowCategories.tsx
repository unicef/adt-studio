import { useLingui, Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { CATEGORIES } from "./categories"

/** Second-row option — four outcome categories, each summarising its features. */
export function SecondRowCategories() {
  const { i18n } = useLingui()
  return (
    <>
      <div className="mb-3 mt-[22px]">
        <div className="text-[15px] font-bold">
          <Trans>What every book gets</Trans>
        </div>
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">
          <Trans>Four things every student gets — the pipeline handles the rest automatically.</Trans>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {CATEGORIES.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.id} className="rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className={cn("mb-2.5 grid size-9 place-items-center rounded-[10px]", c.tint)}>
                <Icon className="size-[18px]" />
              </div>
              <div className="text-[13.5px] font-semibold">{i18n._(c.label)}</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">{i18n._(c.tagline)}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.items.map((it, i) => (
                  <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                    {i18n._(it.title)}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
