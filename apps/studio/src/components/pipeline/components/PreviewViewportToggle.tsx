import { Monitor, Smartphone, Tablet } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PreviewViewport } from "./preview-viewport"

interface PreviewViewportToggleProps {
  value: PreviewViewport
  onChange: (next: PreviewViewport) => void
  className?: string
  /** Current iframe width, shown on the active editor-header control. */
  currentWidth?: number
  /** Viewports whose rendering differs from the compared version. */
  changedViewports?: ReadonlySet<PreviewViewport>
  variant?: "header" | "surface"
}

export function PreviewViewportToggle({
  value,
  onChange,
  className,
  currentWidth,
  changedViewports,
  variant = "header",
}: PreviewViewportToggleProps) {
  const { t } = useLingui()
  const surface = variant === "surface"
  const items: Array<{
    value: PreviewViewport
    icon: typeof Monitor
    label: string
  }> = [
    { value: "desktop", icon: Monitor, label: t`Desktop` },
    { value: "tablet", icon: Tablet, label: t`Tablet` },
    { value: "mobile", icon: Smartphone, label: t`Mobile` },
  ]

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded p-0.5",
        surface ? "bg-muted" : "bg-white/10",
        className
      )}
    >
      {items.map(({ value: viewport, icon: Icon, label }) => {
        const active = viewport === value
        const changed = changedViewports?.has(viewport) ?? false
        const button = (
          <button
            key={viewport}
            type="button"
            onClick={() => onChange(viewport)}
            aria-label={surface ? undefined : label}
            aria-pressed={active}
            title={!surface && !active ? label : undefined}
            className={cn(
              "relative inline-flex items-center gap-1 rounded text-[10px] font-medium transition-colors cursor-pointer",
              surface ? "h-7 px-2" : "h-6 px-1.5",
              surface
                ? active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                : active
                  ? "bg-white text-neutral-900"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {surface || active ? <span>{label}</span> : null}
            {changed ? (
              <>
                <span
                  className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-background"
                  aria-hidden
                />
                <span className="sr-only">{t`Changes detected`}</span>
              </>
            ) : null}
          </button>
        )

        if (surface && changed) {
          return (
            <Tooltip key={viewport}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {t`Changes detected`}
              </TooltipContent>
            </Tooltip>
          )
        }

        if (surface || !active || !currentWidth) return button

        return (
          <Tooltip key={viewport}>
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
