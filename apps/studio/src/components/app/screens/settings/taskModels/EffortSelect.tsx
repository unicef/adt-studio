import { useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import {
  SELECTABLE_REASONING_EFFORTS,
  type ReasoningEffort,
  type ReasoningEffortSupport,
} from "@adt/types"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { EffortDraft, EffortProblem } from "./useTaskModelDrafts"

const INHERIT = "inherit"

const EFFORT_LABELS: Record<ReasoningEffort, MessageDescriptor> = {
  none: msg`None`,
  minimal: msg`Minimal`,
  low: msg`Low`,
  medium: msg`Medium`,
  high: msg`High`,
  xhigh: msg`Extra high`,
  max: msg`Max`,
}

export function useEffortLabel(): (effort: ReasoningEffort) => string {
  const { i18n } = useLingui()
  return (effort) => i18n._(EFFORT_LABELS[effort])
}

export function EffortSelect({
  id,
  label,
  value,
  onChange,
  support,
  inherited,
  inheritLabel,
  problem,
  disabled,
  anyModel = false,
}: {
  id: string
  label: string
  value: EffortDraft
  onChange: (value: EffortDraft) => void
  support: ReasoningEffortSupport | null
  inherited: ReasoningEffort | undefined
  inheritLabel?: string
  problem: EffortProblem
  disabled: boolean
  anyModel?: boolean
}) {
  const { t } = useLingui()
  const effortLabel = useEffortLabel()
  const unsupportedModel = !anyModel && !support
  const options = SELECTABLE_REASONING_EFFORTS.filter((effort) => anyModel || support?.efforts.includes(effort))
  const inheritText =
    inheritLabel ?? (inherited ? t`Default · ${effortLabel(inherited)}` : t`Default`)

  if (unsupportedModel && !value) {
    return (
      <div
        id={id}
        aria-label={label}
        className="flex h-9 items-center rounded-md border border-dashed px-3 text-[12.5px] text-muted-foreground"
      >
        {t`Not supported`}
      </div>
    )
  }

  return (
    <Select
      value={value || INHERIT}
      onValueChange={(next) => onChange(next === INHERIT ? "" : (next as ReasoningEffort))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        aria-invalid={problem !== null}
        className={cn(
          "h-9 text-[13px] focus:ring-offset-0",
          !value && "text-muted-foreground",
          problem && "border-destructive text-destructive",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={INHERIT}>{inheritText}</SelectItem>
        <SelectSeparator />
        {options.map((effort) => (
          <SelectItem key={effort} value={effort}>
            {effortLabel(effort)}
          </SelectItem>
        ))}
        {value && !options.includes(value as (typeof options)[number]) && (
          <SelectItem value={value} disabled>
            {effortLabel(value)}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}

export function EffortProblemNotice({
  problem,
  model,
  effort,
  className,
}: {
  problem: EffortProblem
  model: string
  effort: EffortDraft
  className?: string
}) {
  const { t } = useLingui()
  const effortLabel = useEffortLabel()
  if (!problem || !effort) return null
  const level = effortLabel(effort)
  return (
    <p role="alert" className={cn("text-[12.5px] text-destructive", className)}>
      {problem === "unsupported-model"
        ? t`${model} does not support a reasoning effort setting. Use the default.`
        : t`${model} does not support the ${level} effort. Choose another level.`}
    </p>
  )
}
