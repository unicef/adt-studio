import { useLingui } from "@lingui/react/macro"
import { StepperField } from "@/components/ui/stepper-input"

interface PageRangeFieldProps {
  /** Current [start, end] range. */
  value: [number, number]
  onChange: (value: [number, number]) => void
  min?: number
  max?: number
  startLabel?: string
  endLabel?: string
  /** Marks both inputs invalid and wires aria-describedby to the error. */
  invalid?: boolean
  errorId?: string
}

/**
 * Slider-free page-range picker: a pair of labelled stepper inputs (From / To)
 * sharing one [start, end] value. Token-aware so it works on any surface, and
 * reusable anywhere a page range is chosen without the wizard's slider.
 */
export function PageRangeField({
  value,
  onChange,
  min = 1,
  max,
  startLabel,
  endLabel,
  invalid,
  errorId,
}: PageRangeFieldProps) {
  const { t } = useLingui()
  const [start, end] = value
  return (
    <div className="grid grid-cols-2 gap-3">
      <StepperField
        label={startLabel ?? t`From page`}
        value={start}
        min={min}
        max={max}
        widthClass="w-full"
        invalid={invalid}
        errorId={errorId}
        onValueChange={(n) => { if (n != null) onChange([n, end]) }}
      />
      <StepperField
        label={endLabel ?? t`To page`}
        value={end}
        min={min}
        max={max}
        widthClass="w-full"
        invalid={invalid}
        errorId={errorId}
        onValueChange={(n) => { if (n != null) onChange([start, n]) }}
      />
    </div>
  )
}
