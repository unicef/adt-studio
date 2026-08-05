import { useId, useState, type ComponentProps } from "react"
import { Minus, Plus } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface StepperInputProps
  extends Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "min" | "max" | "step"> {
  /** Current value, or null when the field is empty. */
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  /** Accessible names for the decrement / increment buttons (translate these). */
  decrementLabel: string
  incrementLabel: string
  /** Class applied to the outer wrapper (e.g. width). */
  wrapperClassName?: string
}

/**
 * Number field flanked by a minus and a plus button. Keeps a local draft string
 * so partial input (empty, mid-typing) stays editable while still reporting
 * changes live; the draft is dropped on blur so the field snaps back to the
 * canonical value. The +/- buttons clamp to [min, max].
 */
export function StepperInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  decrementLabel,
  incrementLabel,
  disabled,
  className,
  wrapperClassName,
  onBlur,
  ...input
}: StepperInputProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => {
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    return n
  }

  const display = draft ?? (value == null ? "" : String(value))
  const atMin = value != null && min != null && value <= min
  const atMax = value != null && max != null && value >= max

  const step_ = (delta: number) => {
    setDraft(null)
    onChange(value == null ? clamp(min ?? delta) : clamp(value + delta))
  }

  return (
    <div
      className={cn(
        "flex h-10 items-center overflow-hidden rounded-md border border-input bg-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "opacity-50",
        wrapperClassName,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        tabIndex={-1}
        disabled={disabled || atMin}
        aria-label={decrementLabel}
        onClick={() => step_(-step)}
        className="h-full w-8 shrink-0 rounded-none border-r border-input text-muted-foreground hover:text-foreground"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        disabled={disabled}
        value={display}
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          if (raw === "") onChange(null)
          else {
            const n = Number(raw)
            if (!Number.isNaN(n)) onChange(n)
          }
        }}
        onBlur={(e) => {
          setDraft(null)
          onBlur?.(e)
        }}
        className={cn(
          "h-full w-full min-w-0 border-0 bg-transparent px-1 text-center text-sm tabular-nums outline-none placeholder:text-muted-foreground",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          "disabled:cursor-not-allowed",
          className,
        )}
        {...input}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        tabIndex={-1}
        disabled={disabled || atMax}
        aria-label={incrementLabel}
        onClick={() => step_(step)}
        className="h-full w-8 shrink-0 rounded-none border-l border-input text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

/**
 * Label-above {@link StepperInput}. The shared field pattern for every numeric
 * control (split count, page range), so the label + input + stepper a11y stay
 * consistent in one place.
 */
export function StepperField({
  label,
  value,
  onValueChange,
  widthClass,
  invalid,
  errorId,
  ...rest
}: {
  label: string
  value: number | null
  onValueChange: (value: number | null) => void
  widthClass?: string
  invalid?: boolean
  errorId?: string
} & Omit<
  StepperInputProps,
  "value" | "onChange" | "decrementLabel" | "incrementLabel" | "wrapperClassName" | "aria-invalid" | "aria-describedby"
>) {
  const { t } = useLingui()
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <Label
        htmlFor={id}
        className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      <StepperInput
        id={id}
        value={value}
        onChange={onValueChange}
        wrapperClassName={widthClass}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        decrementLabel={t`Decrease ${label}`}
        incrementLabel={t`Increase ${label}`}
        {...rest}
      />
    </div>
  )
}
