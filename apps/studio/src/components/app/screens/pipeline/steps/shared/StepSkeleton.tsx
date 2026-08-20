import { Trans } from "@lingui/react/macro"
import { RailCollapseButton } from "@/components/app/screens/pipeline/rail/SideRail"
import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return <span className={cn("block shrink-0 rounded-full bg-muted-foreground/15", className)} />
}

const RAIL_ROWS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-1/2", "w-3/5", "w-4/5", "w-1/2"]

/** Rail placeholder while a step's index is still being fetched. */
export function StepRailSkeleton() {
  return (
    <>
      <div className="flex items-center gap-2">
        <Bar className="h-2 w-24" />
        <RailCollapseButton className="-my-1 -mr-1 ml-auto" />
      </div>

      <div aria-hidden className="flex min-h-0 flex-1 flex-col gap-0.5">
        {RAIL_ROWS.map((width, index) => (
          <div
            key={index}
            className="flex items-center gap-1.5 px-1.5 py-1.5 motion-safe:animate-pulse"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <Bar className={cn("h-2 flex-1", width)} />
            <Bar className="h-2 w-3.5" />
          </div>
        ))}
      </div>

      <div className="border-t pt-2.5">
        <Bar className="h-2 w-4/5" />
      </div>
    </>
  )
}

const CARDS = [
  { title: "w-40", lines: ["w-full", "w-11/12", "w-3/5"] },
  { title: "w-56", lines: ["w-full", "w-4/5"] },
  { title: "w-32", lines: ["w-11/12", "w-full", "w-2/3"] },
  { title: "w-48", lines: ["w-3/4"] },
]

/**
 * Body placeholder built at the same centred column width as `StepBody`, so the
 * real output lands where the skeleton already was instead of jumping.
 */
export function StepBodySkeleton() {
  return (
    <div className="h-full w-full overflow-hidden">
      <div role="status" aria-busy className="mx-auto flex w-[820px] max-w-full flex-col gap-4 py-7">
        <span className="sr-only">
          <Trans>Loading…</Trans>
        </span>

        <div className="flex items-baseline gap-3 motion-safe:animate-pulse">
          <Bar className="h-4 w-44" />
          <Bar className="h-2.5 w-20" />
          <div className="ml-auto flex items-center gap-2">
            <Bar className="h-8 w-[220px] rounded-lg" />
            <Bar className="h-8 w-24 rounded-lg" />
          </div>
        </div>

        {CARDS.map((card, index) => (
          <div
            key={index}
            aria-hidden
            className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5 motion-safe:animate-pulse"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <div className="flex items-center gap-2">
              <Bar className="size-3 rounded-full" />
              <Bar className={cn("h-3", card.title)} />
              <Bar className="ml-auto size-6 rounded-md" />
            </div>
            <div className="flex flex-col gap-2">
              {card.lines.map((line, lineIndex) => (
                <Bar key={lineIndex} className={cn("h-2.5", line)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
