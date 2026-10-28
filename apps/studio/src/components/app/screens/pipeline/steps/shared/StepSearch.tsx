import { useRef } from "react"
import { useLingui } from "@lingui/react/macro"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface StepSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  matches?: { shown: number; total: number }
  className?: string
}

export function StepSearch({ value, onChange, placeholder, ariaLabel, matches, className }: StepSearchProps) {
  const { t } = useLingui()
  const ref = useRef<HTMLInputElement>(null)
  const active = value.trim().length > 0
  return (
    <div className={cn("flex w-[260px] shrink-0 items-center gap-2", className)}>
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation()
            onChange("")
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        wrapperClassName="min-w-0 flex-1"
        className="h-9 rounded-[10px] pl-8 pr-7 text-[12px] [&::-webkit-search-cancel-button]:hidden"
        prependIcon={<Search className="size-3.5" />}
        appendIcon={
          active ? (
            <button
              type="button"
              onClick={() => {
                onChange("")
                ref.current?.focus()
              }}
              aria-label={t`Clear search`}
              className="pointer-events-auto -mr-1 grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground animate-in fade-in duration-150 motion-reduce:animate-none"
            >
              <X className="size-3" />
            </button>
          ) : undefined
        }
      />
      <span
        aria-live="polite"
        className={cn(
          "shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground transition-opacity duration-200 motion-reduce:transition-none",
          active && matches ? "opacity-100" : "sr-only opacity-0",
        )}
      >
        {active && matches ? t`${matches.shown} of ${matches.total}` : ""}
      </span>
    </div>
  )
}
