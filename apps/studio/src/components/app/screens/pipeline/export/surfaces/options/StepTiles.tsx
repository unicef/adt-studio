import { useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ExportStepsState } from "./useExportSteps"

export function StepTiles({ steps }: { steps: ExportStepsState }) {
  const { t } = useLingui()
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label={t`Steps`}>
      {steps.steps.map((step, index) => {
        const active = index === steps.index
        const locked = !steps.canOpen(step.key)
        const done = !locked && (index < steps.index || (step.muted && index !== steps.index))
        return (
          <li key={step.key}>
            <button
              type="button"
              onClick={() => steps.setStep(step.key)}
              disabled={locked}
              aria-current={active ? "step" : undefined}
              className={cn(
                "relative flex h-[54px] w-full items-center gap-2.5 overflow-hidden rounded-xl px-3 text-left outline-none transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-(--accent-solid)/50",
                active ? "bg-[color-mix(in_oklab,var(--accent)_9%,transparent)]" : locked ? "cursor-default opacity-60" : "hover:bg-muted/70",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold transition-colors duration-300",
                  active ? "bg-(--accent-solid) text-white" : done ? "bg-(--accent)/15 text-(--accent-solid) dark:text-(--accent)" : "bg-muted text-muted-foreground",
                )}
              >
                {done && !active ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("text-[13px] transition-colors", active ? "font-semibold" : "font-medium", locked && "text-muted-foreground")}>{step.title}</span>
                <span className="truncate text-[11.5px] text-muted-foreground">{step.short}</span>
              </span>
            </button>
            <span aria-hidden className="mx-3 mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full origin-left rounded-full bg-(--accent) transition-transform duration-500 ease-out motion-reduce:transition-none",
                  index <= steps.index ? "scale-x-100" : "scale-x-0",
                )}
              />
            </span>
          </li>
        )
      })}
    </ol>
  )
}

