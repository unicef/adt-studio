import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface SegmentedControlOption<T extends string = string> {
  value: T
  label: string
  icon?: ReactNode
  disabled?: boolean
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
        "relative flex h-11 items-center rounded-lg bg-background p-1",
        className,
      )}
      role="radiogroup"
    >
      {showIndicator ? (
        <div
          className="absolute top-1 bottom-1 rounded-lg bg-accent shadow-sm transition-all duration-200"
          style={{
            width: `calc((100% - 8px) / ${options.length})`,
            left: `calc(4px + ${activeIndex} * (100% - 8px) / ${options.length})`,
          }}
        />
      ) : null}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-disabled={option.disabled || undefined}
          disabled={option.disabled}
          title={option.disabled ? option.disabledHint : undefined}
          onClick={() => {
            if (option.disabled) return
            onValueChange(option.value)
          }}
          className={cn(
            "relative z-10 flex h-7 flex-1 items-center justify-center rounded-md text-sm",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring/40",
            option.disabled
              ? "cursor-not-allowed font-normal text-[#a3a3a3]"
              : value === option.value
                ? "cursor-pointer font-bold"
                : "cursor-pointer font-normal text-[#737373] hover:text-[#525252]",
          )}
          style={
            !option.disabled && value === option.value
              ? {
                  color: color ?? "var(--accent-color, #2b7fff)",
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
      ))}
    </div>
  )
}
