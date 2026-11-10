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
    <div className={cn("flex w-[260px] shrink-0 items-center", className)}>
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
        className={cn(
          "h-9 rounded-[10px] pl-8 text-[12px] transition-[padding,border-color,box-shadow] duration-150 [&::-webkit-search-cancel-button]:hidden",
          "focus-visible:border-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_55%,transparent)] focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_28%,transparent)]",
          active ? (matches ? "pr-[84px]" : "pr-7") : "pr-7",
        )}
        prependIcon={<Search className="size-3.5" />}
        appendIcon={
          active ? (
            <span className="pointer-events-auto -mr-1 flex items-center gap-1.5">
              {matches && (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground animate-in fade-in duration-150 motion-reduce:animate-none">
                  {t`${matches.shown} of ${matches.total}`}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  onChange("")
                  ref.current?.focus()
                }}
                aria-label={t`Clear search`}
                className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground animate-in fade-in duration-150 motion-reduce:animate-none"
              >
                <X className="size-3" />
              </button>
            </span>
          ) : undefined
        }
      />
      <span aria-live="polite" className="sr-only">
        {active && matches ? t`${matches.shown} of ${matches.total}` : ""}
      </span>
    </div>
  )
}
