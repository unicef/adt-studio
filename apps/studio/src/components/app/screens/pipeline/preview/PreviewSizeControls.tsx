import { useState, type KeyboardEvent } from "react"
import { useLingui } from "@lingui/react/macro"
import { Monitor, Smartphone, Tablet } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { clampSize, type PreviewSize } from "./previewSize"

export interface PreviewSizeControlsProps {
  device: Viewport
  size: PreviewSize
  onDeviceChange: (device: Viewport) => void
  onSizeChange: (size: PreviewSize) => void
}

export function PreviewSizeControls({ device, size, onDeviceChange, onSizeChange }: PreviewSizeControlsProps) {
  const { t } = useLingui()
  const devices: Array<{ value: Viewport; icon: typeof Monitor; label: string }> = [
    { value: "desktop", icon: Monitor, label: t`Desktop` },
    { value: "tablet", icon: Tablet, label: t`Tablet` },
    { value: "mobile", icon: Smartphone, label: t`Mobile` },
  ]

  const selectDevice = (value: string) => {
    const next = devices.find((item) => item.value === value)
    if (next) onDeviceChange(next.value)
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={device} onValueChange={selectDevice}>
        <SelectTrigger
          aria-label={t`Device`}
          className="h-8 w-auto gap-2 rounded-lg border-0 bg-muted px-2.5 text-[13px] font-medium focus:ring-offset-0"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {devices.map(({ value, icon: Icon, label }) => (
            <SelectItem key={value} value={value} className="text-[13px]">
              <span className="flex items-center gap-2">
                <Icon className="size-3.5" />
                {label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SizeField
        label={t`Width`}
        abbreviation={t({ message: "W", context: "Width" })}
        value={size.width}
        onCommit={(width) => onSizeChange({ ...size, width })}
      />
      <SizeField
        label={t`Height`}
        abbreviation={t({ message: "H", context: "Height" })}
        value={size.height}
        onCommit={(height) => onSizeChange({ ...size, height })}
      />
    </div>
  )
}

interface SizeFieldProps {
  label: string
  abbreviation: string
  value: number
  onCommit: (value: number) => void
}

function SizeField({ label, abbreviation, value, onCommit }: SizeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    const parsed = Number(draft)
    if (draft.trim() && Number.isFinite(parsed)) onCommit(clampSize(parsed))
    setDraft(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commit()
      event.currentTarget.blur()
    } else if (event.key === "Escape") {
      setDraft(null)
      event.currentTarget.blur()
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1)
      setDraft(null)
      onCommit(clampSize(value + step))
    }
  }

  return (
    <label className="flex h-8 w-21 items-center gap-1 rounded-lg bg-muted px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-ring">
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="w-full min-w-0 bg-transparent font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span aria-hidden className="text-[11px] text-muted-foreground">
        {abbreviation}
      </span>
    </label>
  )
}
