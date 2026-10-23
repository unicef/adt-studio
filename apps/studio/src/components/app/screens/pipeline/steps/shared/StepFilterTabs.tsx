import type { KeyboardEvent, ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface StepFilterOption<T extends string> {
  value: T
  label: ReactNode
  count?: number
  tone?: "default" | "danger"
}

export interface StepFilterTabsProps<T extends string> {
  options: readonly StepFilterOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  accent?: string
  className?: string
}

export function StepFilterTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  accent,
  className,
}: StepFilterTabsProps<T>) {
  const values = options.map((option) => option.value)
  const focusIndex = Math.max(0, values.indexOf(value))
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    const target = event.key === "Home" ? 0 : event.key === "End" ? values.length - 1 : step ? (focusIndex + step + values.length) % values.length : -1
    if (target < 0) return
    event.preventDefault()
    onChange(values[target])
    event.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[target]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("inline-flex shrink-0 items-center rounded-lg border bg-muted/40 p-0.5", className)}
    >
      {options.map((option, index) => {
        const active = option.value === value
        const danger = option.tone === "danger"
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === focusIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium",
              "transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                : danger
                  ? "text-destructive/80 hover:text-destructive"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span
                className={cn("font-mono text-[11px] tabular-nums", danger && "text-destructive")}
                style={active && accent && !danger ? { color: accent } : undefined}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
