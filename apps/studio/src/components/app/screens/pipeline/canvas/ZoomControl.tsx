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
  "grid h-full w-7 place-items-center transition-colors enabled:hover:bg-muted disabled:text-muted-foreground/40"

export function ZoomControl({ value, onChange, disabled, className }: ZoomControlProps) {
  const { t } = useLingui()
  const percent = Math.round(value * 100)

  return (
    <div
      className={cn(
        "flex h-8 items-center overflow-hidden rounded-lg border text-foreground",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(zoomBy(value, 1 / ZOOM_STEP))}
        disabled={disabled || value <= ZOOM_MIN}
        title={t`Zoom out`}
        aria-label={t`Zoom out`}
        className={STEP_CLASS}
      >
        <ZoomOut className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={disabled || value === 1}
        title={t`Reset zoom`}
        className={cn(
          "h-full w-12 border-x text-center font-mono text-[11px] tabular-nums transition-colors enabled:hover:bg-muted",
          disabled && "text-muted-foreground/40",
        )}
      >
        {t`${percent}%`}
      </button>
      <button
        type="button"
        onClick={() => onChange(zoomBy(value, ZOOM_STEP))}
        disabled={disabled || value >= ZOOM_MAX}
        title={t`Zoom in`}
        aria-label={t`Zoom in`}
        className={STEP_CLASS}
      >
        <ZoomIn className="size-3.5" />
      </button>
    </div>
  )
}
