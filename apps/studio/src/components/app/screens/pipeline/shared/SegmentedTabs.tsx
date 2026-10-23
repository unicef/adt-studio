import { Fragment } from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export interface SegmentedTab<T extends string> {
  value: T
  label: React.ReactNode
  ariaLabel?: string
  disabled?: boolean
  hint?: string
}

export interface SegmentedTabsProps<T extends string> {
  tabs: readonly [SegmentedTab<T>, SegmentedTab<T>]
  value: T
  onChange: (value: T) => void
  idBase: string
  label?: string
  className?: string
}

export function tabId(idBase: string, value: string) {
  return `tab-${value}-${idBase}`
}

export function tabPanelId(idBase: string, value: string) {
  return `panel-${value}-${idBase}`
}

export function tabPanelProps(idBase: string, value: string) {
  return { role: "tabpanel", id: tabPanelId(idBase, value), "aria-labelledby": tabId(idBase, value), tabIndex: 0 } as const
}

export function onTabListKeyDown<T extends string>(
  event: React.KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  onChange: (value: T) => void,
) {
  const index = values.indexOf(current)
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
  const target = event.key === "Home" ? 0 : event.key === "End" ? values.length - 1 : step ? (index + step + values.length) % values.length : -1
  if (target < 0) return
  event.preventDefault()
  onChange(values[target])
  event.currentTarget.querySelectorAll<HTMLElement>("[role=tab]")[target]?.focus()
}

export function SegmentedTabs<T extends string>({ tabs, value, onChange, idBase, label, className }: SegmentedTabsProps<T>) {
  const second = value === tabs[1].value
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => onTabListKeyDown(event, tabs.filter((tab) => !tab.disabled || tab.value === value).map((tab) => tab.value), value, onChange)}
      className={cn("relative grid h-7 w-full grid-cols-2 rounded-md bg-muted p-0.5 text-[12px] font-medium", className)}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[5px] bg-card shadow-sm ring-1 ring-foreground/45 transition-transform duration-250 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none dark:bg-white/12 dark:ring-white/40"
        style={{ transform: second ? "translateX(100%)" : "translateX(0)" }}
      />
      {tabs.map((tab) => {
        const active = tab.value === value
        const button = (
          <button
            type="button"
            role="tab"
            id={tabId(idBase, tab.value)}
            aria-controls={tabPanelId(idBase, tab.value)}
            aria-selected={active}
            aria-label={tab.ariaLabel}
            aria-disabled={tab.disabled || undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!tab.disabled) onChange(tab.value)
            }}
            className={cn(
              "relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-[5px] px-2 transition-[color,opacity] duration-150",
              active ? "font-semibold text-foreground" : tab.disabled ? "cursor-not-allowed text-foreground/70 opacity-40" : "text-foreground/70 hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        )
        if (!tab.hint) return <Fragment key={tab.value}>{button}</Fragment>
        return (
          <Tooltip key={tab.value}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              {tab.hint}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
