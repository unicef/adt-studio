import { Trans, useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

import {
  activityTypeVisual,
  useActivityTypeLabel,
  type ActivityReviewItem,
} from "./activity-labels"

export function ClassificationOption({
  type,
  label,
  compact = false,
}: {
  type: string | null
  label: string
  compact?: boolean
}) {
  const visual = activityTypeVisual(type)
  const Icon = visual.icon
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        compact ? "size-5" : "size-6",
        visual.tileClassName,
      )}>
        <Icon aria-hidden="true" className={compact ? "size-3" : "size-3.5"} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  )
}


export function ActivityClassificationSelect({
  item,
  options,
  hasSelection,
  value,
  onChange,
}: {
  item: ActivityReviewItem
  options: string[]
  hasSelection: boolean
  value: string | null | undefined
  onChange: (value: string | null) => void
}) {
  const { t } = useLingui()
  const activityTypeLabel = useActivityTypeLabel()
  const notAnActivityValue = JSON.stringify(null)
  const selectedValue = hasSelection ? value ?? notAnActivityValue : ""
  const selectedLabel = hasSelection
    ? value === null
      ? t`Not an activity`
      : value
        ? activityTypeLabel(value)
        : undefined
    : undefined

  return (
    <Select
      value={selectedValue}
      onValueChange={(nextValue) => onChange(
        nextValue === notAnActivityValue ? null : nextValue,
      )}
    >
      <SelectTrigger
        aria-label={t`Classification for ${item.href}`}
        className={cn(
          "h-10 w-full rounded-lg border-slate-300 bg-white text-sm shadow-sm hover:border-primary/40 data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/15",
          hasSelection && value === "activity_quiz" && "text-orange-700",
          hasSelection && value !== null && value !== undefined && value !== "activity_quiz" && "text-violet-800",
        )}
      >
        <SelectValue placeholder={t`Choose classification`}>
          {selectedLabel !== undefined ? (
            <ClassificationOption type={value ?? null} label={selectedLabel} compact />
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="max-h-80 w-[var(--radix-select-trigger-width)] rounded-lg"
      >
        {options.map((type) => (
          <SelectItem
            key={type}
            value={type}
            className={cn(
              "py-2.5 text-sm",
              type === "activity_quiz"
                ? "text-orange-700 focus:bg-orange-50 focus:text-orange-800"
                : "text-violet-800 focus:bg-violet-50 focus:text-violet-900",
            )}
          >
            <ClassificationOption type={type} label={activityTypeLabel(type)} />
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={notAnActivityValue} className="py-2.5 text-sm text-slate-700 focus:bg-slate-100">
          <ClassificationOption type={null} label={t`Not an activity`} />
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

