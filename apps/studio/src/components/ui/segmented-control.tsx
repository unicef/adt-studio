import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { UnavailableHint } from "@/components/pipeline/components/UnavailableHint"

export interface SegmentedControlOption<T extends string = string> {
  value: T
  label: string
  icon?: ReactNode
  disabled?: boolean
  /** Why the option is unavailable — shown in a tooltip on hover, focus or click. */
  disabledHint?: string
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[]
  value: T | ""
  onValueChange: (value: T) => void
  className?: string
  color?: string
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onValueChange,
  className,
  color,
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex((o) => o.value === value)
  const showIndicator = activeIndex >= 0 && options.length > 0

  return (
    <div
      className={cn(
        "relative flex h-11 items-center rounded-lg bg-secondary p-1",
        className,
      )}
      role="radiogroup"
    >
      {showIndicator ? (
        <div
          className="absolute top-1 bottom-1 rounded-md bg-card ring-1 ring-border shadow-sm transition-all duration-200 dark:bg-accent"
          style={{
            width: `calc((100% - 8px) / ${options.length})`,
            left: `calc(4px + ${activeIndex} * (100% - 8px) / ${options.length})`,
          }}
        />
      ) : null}
      {options.map((option) => {
        // An unavailable option stays focusable and keeps receiving pointer
        // events (aria-disabled rather than disabled) so its hint tooltip can
        // open on hover, focus or click; the click itself is ignored.
        const button = (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            aria-disabled={option.disabled || undefined}
            onClick={() => {
              if (option.disabled) return
              onValueChange(option.value)
            }}
            className={cn(
              "relative z-10 flex h-7 flex-1 items-center justify-center rounded-md text-sm",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring/40",
              option.disabled
                ? "cursor-not-allowed font-normal text-muted-foreground/60"
                : value === option.value
                  ? "cursor-pointer font-bold"
                  : "cursor-pointer font-normal text-muted-foreground hover:text-foreground",
            )}
            style={
              !option.disabled && value === option.value
                ? {
                    color: color ?? "var(--accent-color, var(--primary))",
                    transition: "color 0.4s ease",
                  }
                : { transition: "color 0.4s ease" }
            }
          >
            {option.icon ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex shrink-0 items-center" aria-hidden>
                  {option.icon}
                </span>
                {option.label}
              </span>
            ) : (
              option.label
            )}
          </button>
        )
        return option.disabled && option.disabledHint ? (
          <UnavailableHint key={option.value} hint={option.disabledHint}>
            {button}
          </UnavailableHint>
        ) : (
          button
        )
      })}
    </div>
  )
}
