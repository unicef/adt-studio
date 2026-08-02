import { Monitor, Smartphone, Tablet } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DeviceView } from "./device-breakpoint"

interface ViewportToggleProps {
  value: DeviceView
  onChange: (next: DeviceView) => void
  className?: string
  /** Current iframe visible width in CSS pixels. Shown in a tooltip on the active button. */
  currentWidth?: number
}

export function ViewportToggle({ value, onChange, className, currentWidth }: ViewportToggleProps) {
  const { t } = useLingui()
  const items: Array<{ value: DeviceView; icon: typeof Monitor; label: string }> = [
    { value: "desktop", icon: Monitor, label: t`Desktop` },
    { value: "tablet", icon: Tablet, label: t`Tablet` },
    { value: "mobile", icon: Smartphone, label: t`Mobile` },
  ]

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded bg-white/10 p-0.5",
        className
      )}
    >
      {items.map(({ value: v, icon: Icon, label }) => {
        const active = v === value
        const button = (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-label={label}
            aria-pressed={active}
            title={active ? undefined : label}
            className={cn(
              "inline-flex items-center gap-1 h-6 rounded px-1.5 text-[10px] cursor-pointer transition-colors",
              active
                ? "bg-white text-neutral-900"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {active ? <span>{label}</span> : null}
          </button>
        )

        if (!active || !currentWidth) return button

        return (
          <Tooltip key={v}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {label} · {currentWidth}px
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
