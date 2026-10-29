import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { LayoutGrid } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { PageProblemNotice } from "./PageProblemNotice"
import type { PageProblem } from "./usePageProblem"

const CHIP_TONE = {
  critical: cn(
    "border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/15 data-[state=open]:bg-destructive/15",
    "focus-visible:ring-destructive/45",
  ),
  attention: cn(
    "border-[color-mix(in_srgb,var(--tint)_35%,transparent)] bg-[color-mix(in_srgb,var(--tint)_10%,transparent)]",
    "text-[color-mix(in_oklab,var(--tint)_80%,black)] dark:text-[color-mix(in_oklab,var(--tint)_70%,white)]",
    "hover:bg-[color-mix(in_srgb,var(--tint)_16%,transparent)] data-[state=open]:bg-[color-mix(in_srgb,var(--tint)_16%,transparent)]",
    "focus-visible:ring-[color-mix(in_srgb,var(--tint)_45%,transparent)]",
  ),
}

function ChipLabel({ problem }: { problem: PageProblem }) {
  if (problem.scope === "page") return <Trans>This page failed</Trans>
  if (problem.level === "blocked") return <Trans>Extract failed</Trans>
  return <Trans>Extract didn't finish</Trans>
}

export function PageProblemChip({ problem, hex, onAllPages }: { problem: PageProblem; hex: string; onAllPages: () => void }) {
  const Icon = problem.icon
  const tone = problem.level === "blocked" ? "critical" : "attention"
  const [open, setOpen] = useState(false)
  const action = problem.action && {
    ...problem.action,
    onClick: () => {
      setOpen(false)
      problem.action?.onClick()
    },
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          style={{ ["--tint" as string]: hex }}
          className={cn(
            "flex h-6 items-center gap-1.5 self-center rounded-full border px-2 text-[11.5px] font-semibold whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 motion-reduce:transition-none",
            CHIP_TONE[tone],
          )}
        >
          <Icon className="size-3 shrink-0" strokeWidth={2.4} />
          <ChipLabel problem={problem} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        role="dialog"
        aria-label={problem.title}
        className="flex w-[min(460px,calc(100vw-32px))] origin-[var(--radix-popover-content-transform-origin)] flex-col gap-2 border-0 bg-transparent p-0 shadow-none duration-200 ease-out data-[state=closed]:duration-150 data-[state=closed]:ease-in motion-reduce:animate-none"
      >
        <div className="rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40">
          <PageProblemNotice problem={{ ...problem, action }} hex={hex} />
        </div>
        {problem.scope === "stage" && (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onAllPages()
            }}
            className="flex h-7 w-fit items-center gap-1.5 self-end rounded-lg border bg-card px-2.5 text-[12px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LayoutGrid className="size-3" />
            <Trans>See it on All pages</Trans>
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
