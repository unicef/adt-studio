import { useId } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { EXPIRY_OPTIONS, type ExpiryChoiceValue } from "./expiry-options"

interface ExpiryChoiceProps {
  value: ExpiryChoiceValue
  onChange: (value: ExpiryChoiceValue) => void
  label: string
  disabled?: boolean
}

/** Native radios inside a labelled group — same accessibility shape as the
 *  Cloudflare account picker, so a keyboard user gets arrow-key selection. */
export function ExpiryChoice({ value, onChange, label, disabled = false }: ExpiryChoiceProps) {
  const { i18n } = useLingui()
  const groupId = useId()
  const name = `${groupId}-expiry`

  return (
    <div className="flex flex-col gap-2">
      <span id={groupId} className="text-sm font-medium text-foreground">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={groupId}
        data-testid="publish-expiry-choice"
        className="flex flex-wrap gap-2"
      >
        {EXPIRY_OPTIONS.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-[background-color,border-color,color] duration-200 motion-reduce:transition-none",
                selected
                  ? "border-primary/60 bg-primary/5 font-medium text-foreground"
                  : "border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                className="size-3.5 shrink-0 accent-primary"
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span>{i18n._(option.label)}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
