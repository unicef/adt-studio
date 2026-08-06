import { useEffect, useState } from "react"
import { useLingui, Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { CATEGORIES } from "./categories"
import { CategoryDemo } from "./CategoryDemo"

/** Second-row option — category tabs with a live demo of what each produces. */
export function SecondRowDemo() {
  const { i18n } = useLingui()
  const [active, setActive] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query, not user text
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => setActive((a) => (a + 1) % CATEGORIES.length), 4200)
    return () => clearInterval(id)
  }, [])

  const cat = CATEGORIES[active]

  return (
    <>
      <div className="mb-3 mt-[22px]">
        <div className="text-[15px] font-bold">
          <Trans>What every book gets</Trans>
        </div>
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">
          <Trans>Pick a category to see what ADT Studio produces.</Trans>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-1.5">
        <div className="flex gap-1">
          {CATEGORIES.map((c, i) => {
            const Icon = c.icon
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                  i === active ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", c.tint)}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[13px] font-semibold", i === active && c.accentText)}>{i18n._(c.label)}</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground">{i18n._(c.tagline)}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-4 p-3">
          <div className="space-y-3">
            {cat.items.map((it, i) => {
              const Icon = it.icon
              return (
                <div key={i} className="flex gap-2.5">
                  <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", it.tint)}>
                    <Icon className="size-3.5" />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-semibold">{i18n._(it.title)}</div>
                    <div className="text-[11px] leading-snug text-muted-foreground">{i18n._(it.blurb)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="min-h-[168px]">
            <CategoryDemo category={cat} />
          </div>
        </div>
      </div>
    </>
  )
}
