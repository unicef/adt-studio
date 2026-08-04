import { X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { BookFontSelector } from "@/components/pipeline/components/BookFontSelector"
import { Input } from "@/components/ui/input"
import type { DeviceView } from "./style-editor/device-breakpoint"

export interface CanvasTransform {
  x: number
  y: number
  angle: number
}

export function BookDesignPanel({
  bookLabel,
  onClose,
}: {
  bookLabel: string
  onClose: () => void
}) {
  const { t } = useLingui()
  return (
    <aside className="fixed right-6 top-24 z-50 w-80 rounded-xl border bg-background p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t`Book design`}</h2>
        <button type="button" onClick={onClose} aria-label={t`Close book design`}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {t`Choose one accessible font family for all reflowable storyboard pages.`}
      </p>
      <BookFontSelector bookLabel={bookLabel} />
    </aside>
  )
}

export function CanvasTransformPanel({
  deviceView,
  value,
  onChange,
}: {
  deviceView: DeviceView
  value: CanvasTransform
  onChange: (value: CanvasTransform) => void
}) {
  const { t } = useLingui()
  return (
    <aside className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border bg-background p-3 shadow-xl">
      <div className="mb-2 text-xs font-semibold">{t`Position for ${deviceView}`}</div>
      <div className="flex gap-2">
        {(["x", "y", "angle"] as const).map((field) => (
          <label key={field} className="grid gap-1 text-[10px] uppercase text-muted-foreground">
            {field === "angle" ? t`Angle` : field === "x" ? t`X position` : t`Y position`}
            <Input
              type="number"
              value={value[field]}
              onChange={(event) => onChange({
                ...value,
                [field]: Number(event.target.value) || 0,
              })}
              className="h-8 w-20 text-xs"
            />
          </label>
        ))}
      </div>
    </aside>
  )
}
