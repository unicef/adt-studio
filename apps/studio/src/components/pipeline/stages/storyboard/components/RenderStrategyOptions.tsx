import { Check } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { RenderStrategyThumb, StrategyThumbPaper } from "./RenderStrategyThumb"

export interface RenderStrategyOption {
  id: string
  name: string
  description?: string
  renderType?: string
}

export interface RenderStrategyOptionsProps {
  options: RenderStrategyOption[]
  value: string
  onChange: (id: string) => void
  className?: string
}

export function RenderStrategyOptions({
  options,
  value,
  onChange,
  className,
}: RenderStrategyOptionsProps) {
  const { t } = useLingui()

  if (options.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        <Trans>No render strategies are configured for this book.</Trans>
      </p>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label={t`Default render strategy`}
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-3",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "group relative flex flex-col gap-2.5 rounded-xl border bg-card p-2.5 text-left transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selected
                ? "border-primary ring-2 ring-primary/25"
                : "hover:border-primary/40 hover:shadow-sm",
            )}
          >
            <StrategyThumbPaper
              className={cn(
                "transition-transform",
                selected ? "scale-[1.01]" : "group-hover:scale-[1.01]",
              )}
            >
              <RenderStrategyThumb strategy={option.id} renderType={option.renderType} />
            </StrategyThumbPaper>

            <div className="flex min-h-0 flex-col gap-0.5 px-0.5 pb-0.5">
              <div className="flex items-start gap-1.5">
                <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-tight">
                  {option.name}
                </span>
                <span
                  className={cn(
                    "mt-px grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                  aria-hidden
                >
                  {selected ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
                </span>
              </div>
              {option.description ? (
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
              {option.renderType === "template" ? (
                <span className="mt-1 w-fit rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Trans>Template</Trans>
                </span>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}
