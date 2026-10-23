import { useContext, type ReactNode } from "react"
import {
  Select as RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { StyleLabelContext } from "./StyleLabel"

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** Optional rich preview shown inside the dropdown row (not in the trigger). */
  preview?: ReactNode
}

interface SelectProps<T extends string> {
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<SelectOption<T>>
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Style-editor-tuned wrapper around the shadcn Select. Standardizes height
 * (h-8), typography (text-[12px]), and removes the focus-ring offset so it
 * sits flush in the StyleLabel control column.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: SelectProps<T>) {
  const selectedLabel = options.find((o) => o.value === value)?.label
  const labelledBy = useContext(StyleLabelContext)
  return (
    <RadixSelect
      value={value}
      onValueChange={(v) => onChange(v as T)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-labelledby={labelledBy}
        className={cn(
          "h-8 w-full text-[12px] px-2 py-0 border-0 bg-muted/60 ring-offset-0 focus:ring-1 focus:ring-inset focus:ring-violet-500 focus:ring-offset-0 data-[state=open]:bg-background data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-violet-500",
          className
        )}
      >
        <SelectValue placeholder={placeholder}>
          {selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[12px]">
            {o.preview ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex w-8 shrink-0 items-center justify-center text-foreground">
                  {o.preview}
                </span>
                <span className="text-muted-foreground">{o.label}</span>
              </span>
            ) : (
              o.label
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </RadixSelect>
  )
}
