import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Collapsible, CollapseChevron } from "../list/Collapsible"
import type { ProblemAction } from "./ProblemNotice"
import { ProblemActionButton } from "./ProblemActionButton"
import { TONE_BORDER, TONE_ICON, TONE_TEXT } from "@/components/ui/notice-tone"
import { problemTone } from "./problemTone"
import type { DescribedProblem } from "./useDescribeProblem"
import { problemIcon } from "./useProblemAction"

export function ProblemStrip({ problem, action }: { problem: DescribedProblem; action?: ProblemAction }) {
  const [open, setOpen] = useState(false)
  const Icon = problemIcon(problem)
  const tone = problemTone(problem.level)
  return (
    <section
      role={problem.level === "blocked" ? "alert" : "status"}
      data-tone={tone}
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-[12.5px] animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none",
        TONE_BORDER[tone],
      )}
    >
      <div className="flex h-10 items-center gap-2.5 px-3">
        <Icon className={cn("size-4 shrink-0", TONE_ICON[tone])} />
        <p className="min-w-0 flex-1 truncate font-medium text-foreground" title={problem.title}>
          {problem.title}
        </p>
        {problem.details && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Trans>Details</Trans>
            <CollapseChevron open={open} />
          </button>
        )}
        {action && (
          <ProblemActionButton
            action={action}
            className={cn(
              "h-7 rounded-md px-2 text-[12px] font-semibold hover:bg-muted aria-disabled:cursor-default aria-disabled:text-muted-foreground! aria-disabled:hover:bg-transparent",
              TONE_TEXT[tone],
            )}
          />
        )}
      </div>
      {problem.details && (
        <Collapsible open={open}>
          <pre className="whitespace-pre-wrap break-words border-t bg-muted/40 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">{problem.details}</pre>
        </Collapsible>
      )}
    </section>
  )
}
