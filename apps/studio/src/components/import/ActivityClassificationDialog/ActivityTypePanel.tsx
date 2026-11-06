import { useId, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import {
  activityTypeVisual,
  suggestedTypesFor,
  useActivityTypeDescription,
  useActivityTypeLabel,
  useControlsLabel,
  type ActivityReviewItem,
} from "./activity-labels"

/**
 * The type choice for one page, as a filterable single-select list (Primer's
 * SelectPanel, Carbon's radio group): "Not an activity" on its own, types that
 * fit the controls found, then every type, each with what the learner does.
 * Suggestions are marked by their group, never preselected.
 */
export function ActivityTypePanel({
  item,
  options,
  value,
  hasSelection,
  onChange,
}: {
  item: ActivityReviewItem
  options: string[]
  value: string | null | undefined
  hasSelection: boolean
  onChange: (value: string | null) => void
}) {
  const { t } = useLingui()
  const typeLabel = useActivityTypeLabel()
  const typeDescription = useActivityTypeDescription()
  const controlsLabel = useControlsLabel()
  const [query, setQuery] = useState("")
  const name = useId()
  const filterId = useId()

  const needle = query.trim().toLocaleLowerCase()
  const matches = (label: string, description: string) => !needle
    || label.toLocaleLowerCase().includes(needle)
    || description.toLocaleLowerCase().includes(needle)
  const suggested = suggestedTypesFor(item.controls).filter((type) => options.includes(type))
  const others = options.filter((type) => !suggested.includes(type))
  const notActivityLabel = t`Not an activity`
  const notActivityText = t`Keep it as reading content. Its controls stay as they are.`

  const option = (type: string | null, label: string, description: string) => (
    <TypeOption
      key={type ?? "none"}
      name={name}
      type={type}
      label={label}
      description={description}
      checked={hasSelection && value === type}
      onSelect={() => onChange(type)}
    />
  )
  const group = (title: ReactNode, children: ReactNode[]) => children.length === 0 ? null : (
    <div role="group" className="flex flex-col gap-0.5 border-t border-border px-1.5 pb-2 pt-2.5 first:border-t-0 first:pt-1">
      <p className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      {children}
    </div>
  )

  const notActivity = matches(notActivityLabel, notActivityText) ? [option(null, notActivityLabel, notActivityText)] : []
  const suggestedOptions = suggested
    .filter((type) => matches(typeLabel(type), typeDescription(type)))
    .map((type) => option(type, typeLabel(type), typeDescription(type)))
  const otherOptions = others
    .filter((type) => matches(typeLabel(type), typeDescription(type)))
    .map((type) => option(type, typeLabel(type), typeDescription(type)))
  const empty = notActivity.length + suggestedOptions.length + otherOptions.length === 0

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground"><Trans>Activity type</Trans></p>
        <label htmlFor={filterId} className="relative block">
          <span className="sr-only"><Trans>Filter types</Trans></span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={filterId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t`Filter types`}
            className="h-8 pl-8 text-sm"
          />
        </label>
      </div>
      <div role="radiogroup" aria-label={t`Activity type for ${item.href}`} className="min-h-0 flex-1 overflow-y-auto py-1">
        {group(<Trans>Not an activity</Trans>, notActivity)}
        {group(<Trans>Suggested for {controlsLabel(item.controls)}</Trans>, suggestedOptions)}
        {group(suggested.length > 0 ? <Trans>All types</Trans> : <Trans>Activity types</Trans>, otherOptions)}
        {empty ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground"><Trans>No type matches “{query}”.</Trans></p>
        ) : null}
      </div>
    </div>
  )
}

function TypeOption({
  name,
  type,
  label,
  description,
  checked,
  onSelect,
}: {
  name: string
  type: string | null
  label: string
  description: string
  checked: boolean
  onSelect: () => void
}) {
  const visual = activityTypeVisual(type)
  const Icon = visual.icon
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted/70",
        checked && "bg-brand-500/10 hover:bg-brand-500/10",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-3.5 shrink-0 accent-brand-600"
      />
      <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", visual.tileClassName)}>
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}
