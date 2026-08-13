import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useLingui, Trans } from "@lingui/react/macro"
import { BookOpen, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { CATEGORIES } from "./categories"
import { CategoryDemo } from "./CategoryDemo"
import { SecondRowHeader, SamplePanel } from "./SecondRowShell"

export function SecondRowSampleWalkthrough() {
  const { i18n } = useLingui()
  const navigate = useNavigate()
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = setInterval(() => setActive((a) => (a + 1) % CATEGORIES.length), 3600)
    return () => clearInterval(id)
  }, [])

  const cat = CATEGORIES[active]

  return (
    <>
      <SecondRowHeader
        title={<Trans>Take a finished book for a spin</Trans>}
        description={<Trans>One sample textbook, four ways to experience it. Pick a facet or let it play.</Trans>}
        aside={
          <Badge variant="info" className="items-center gap-1.5">
            <GraduationCap className="size-3.5" />
            <Trans>Grade 5 · Science</Trans>
          </Badge>
        }
      />

      <SamplePanel className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 flex flex-col gap-1.5 lg:order-1" role="tablist" aria-orientation="vertical">
          {CATEGORIES.map((c, i) => {
            const Icon = c.icon
            const on = i === active
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-border bg-card shadow-sm" : "border-transparent hover:bg-card/60",
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", c.tint)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13px] font-semibold", on && c.accentText)}>{i18n._(c.label)}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{i18n._(c.tagline)}</span>
                </span>
                <span
                  aria-hidden
                  className={cn("size-1.5 shrink-0 rounded-full transition-colors duration-200", on ? c.accentBg : "bg-transparent")}
                />
              </button>
            )
          })}
          <Button className="mt-2" onClick={() => navigate({ to: "/books/new" })}>
            <BookOpen className="size-4" />
            <Trans>Open this sample</Trans>
          </Button>
        </div>

        <div className="order-1 min-h-[220px] lg:order-2">
          <CategoryDemo category={cat} />
        </div>
      </SamplePanel>
    </>
  )
}
