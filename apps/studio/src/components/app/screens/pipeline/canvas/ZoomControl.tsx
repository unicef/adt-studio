import { useLingui } from "@lingui/react/macro"
import { ZoomIn, ZoomOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomBy } from "./zoom"

export interface ZoomControlProps {
  value: number
  onChange: (zoom: number) => void
  disabled?: boolean
  className?: string
}

const STEP_CLASS =
  "grid h-full w-7 place-items-center transition-colors first:rounded-l-[inherit] last:rounded-r-[inherit] hover:bg-muted aria-disabled:cursor-default aria-disabled:text-muted-foreground/40 aria-disabled:hover:bg-transparent"

export function ZoomControl({ value, onChange, disabled, className }: ZoomControlProps) {
  const { t } = useLingui()
  const percent = Math.round(value * 100)
  const outDisabled = disabled || value <= ZOOM_MIN
  const resetDisabled = disabled || value === 1
  const inDisabled = disabled || value >= ZOOM_MAX
  const guard = (blocked: boolean, action: () => void) => () => {
    if (!blocked) action()
  }

  return (
    <div
      role="group"
      aria-label={t`Zoom`}
      className={cn(
        "flex h-8 items-center rounded-lg border text-foreground",
        className,
      )}
    >
      <button
        type="button"
        onClick={guard(outDisabled, () => onChange(zoomBy(value, 1 / ZOOM_STEP)))}
        aria-disabled={outDisabled || undefined}
        title={t`Zoom out`}
        aria-label={t`Zoom out`}
        className={STEP_CLASS}
      >
        <ZoomOut className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={guard(resetDisabled, () => onChange(1))}
        aria-disabled={resetDisabled || undefined}
        title={t`Reset zoom`}
        aria-label={t`Reset zoom, ${percent}%`}
        className={cn(
          "h-full w-12 border-x text-center font-mono text-[11px] tabular-nums transition-colors hover:bg-muted aria-disabled:cursor-default aria-disabled:hover:bg-transparent",
          disabled && "text-muted-foreground/40",
        )}
      >
        {t`${percent}%`}
      </button>
      <button
        type="button"
        onClick={guard(inDisabled, () => onChange(zoomBy(value, ZOOM_STEP)))}
        aria-disabled={inDisabled || undefined}
        title={t`Zoom in`}
        aria-label={t`Zoom in`}
        className={STEP_CLASS}
      >
        <ZoomIn className="size-3.5" />
      </button>
    </div>
  )
}
