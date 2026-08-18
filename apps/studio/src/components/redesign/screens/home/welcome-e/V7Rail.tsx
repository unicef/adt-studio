import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SectionHeading } from "./shared"
import { ALL_FEATURES, type Feature } from "./data"

const byKey = (k: string): Feature => ALL_FEATURES.find((f) => f.key === k)!

const GROUPS: { label: ReactNode; keys: string[] }[] = [
  { label: <Trans>Read</Trans>, keys: ["easy-read", "translate", "contents", "glossary"] },
  { label: <Trans>Listen &amp; watch</Trans>, keys: ["listen", "sign"] },
  { label: <Trans>See &amp; check</Trans>, keys: ["captions", "quizzes", "wcag"] },
]

export function V7Rail() {
  return (
    <>
      <SectionHeading
        title={<Trans>Every edition, fully accessible</Trans>}
        subtitle={<Trans>Grouped by how each reader reaches the page.</Trans>}
      />
      <div className="flex flex-col gap-3.5 rounded-2xl border bg-card p-5 sm:flex-row sm:gap-6">
        {GROUPS.map((g, gi) => (
          <div key={gi} className="flex-1">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {g.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.keys.map((k) => {
                const f = byKey(k)
                const Icon = f.icon
                return (
                  <span
                    key={k}
                    className="inline-flex items-center gap-2 rounded-full border bg-background py-1.5 pl-1.5 pr-3.5 text-[12.5px] font-semibold"
                  >
                    <span className={cn("grid size-6 place-items-center rounded-full", f.solid)}>
                      <Icon className="size-3.5" />
                    </span>
                    {f.label}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
