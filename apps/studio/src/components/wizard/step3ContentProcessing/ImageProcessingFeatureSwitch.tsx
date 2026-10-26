import type { MessageDescriptor } from "@lingui/core"
import type { PresetAccent } from "@/components/wizard/constants"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { BrandedSwitch } from "@/components/ui/branded-switch"
import type { ImageProcessingPreviewFocus } from "./imageProcessingPreviewTypes"
import { useDelayedPreviewFocus } from "@/components/wizard"

export type ImageProcessingFeatureSwitchProps = {
  title: string
  subtitle: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  previewFocus: ImageProcessingPreviewFocus
  id: string
  className?: string
  disabled?: boolean
  recommended?: boolean
  presetLabel?: MessageDescriptor
  accent?: PresetAccent
}


export function ImageProcessingFeatureSwitch({
  title,
  subtitle,
  checked,
  onCheckedChange,
  previewFocus,
  id,
  disabled = false,
  recommended = false,
  presetLabel,
  accent,
}: ImageProcessingFeatureSwitchProps) {
  const { i18n, t } = useLingui()
  const { onMouseEnter, onMouseLeave } = useDelayedPreviewFocus(previewFocus)

  function toggle() {
    if (disabled) return
    onCheckedChange(!checked)
  }

  return (
    <div
      role="switch"
      id={id}
      aria-checked={checked}
      aria-disabled={disabled}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-subtitle`}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        "flex w-full cursor-pointer select-none items-center justify-center gap-2.5 rounded-lg border px-4 py-3 shadow-sm transition-colors",
        "bg-card border-border",
        "hover:bg-muted hover:border-input",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled && "cursor-not-allowed opacity-60 hover:bg-card hover:border-border",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={() => {
        toggle()
      }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          toggle()
        }
      }}
    >
      <div className="flex min-w-0 flex-1 flex-row items-center self-stretch">
        <div className="flex min-h-px min-w-px flex-1 flex-col items-start justify-center gap-0.5">
          <div className="flex items-center gap-2">
            <p
              id={`${id}-title`}
              className="select-none text-sm font-semibold leading-5 text-foreground"
            >
              {title}
            </p>
            {recommended && (
              <span
                className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none"
                style={accent
                  ? { borderColor: `${accent.bg}40`, backgroundColor: `${accent.bg}10`, color: accent.text, transition: "border-color 0.4s ease, background-color 0.4s ease, color 0.4s ease" }
                  : { borderColor: "#e5e5e5", backgroundColor: "#f5f5f5", color: "#525252" }
                }
              >
                {presetLabel
                  ? t`Recommended for ${i18n._(presetLabel)}`
                  : t`Recommended`}
              </span>
            )}
          </div>
          <p
            id={`${id}-subtitle`}
            className="w-full select-none text-xs font-normal leading-4 text-muted-foreground"
          >
            {subtitle}
          </p>
        </div>
      </div>
      <BrandedSwitch
        id={`${id}-switch`}
        checked={checked}
        decorative
        disabled={disabled}
        color={accent?.bg}
      />
    </div>
  )
}
