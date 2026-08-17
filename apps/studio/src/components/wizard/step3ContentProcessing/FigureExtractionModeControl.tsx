import type { MessageDescriptor } from "@lingui/core"
import { useLingui } from "@lingui/react/macro"
import type { FigureExtractionMode } from "@adt/types"
import type { PresetAccent } from "@/components/wizard/constants"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useDelayedPreviewFocus } from "@/components/wizard"

export function FigureExtractionModeControl({
  title,
  subtitle,
  value,
  onValueChange,
  recommended,
  presetLabel,
  accent,
  labels,
}: {
  title: string
  subtitle: string
  value: FigureExtractionMode
  onValueChange: (value: FigureExtractionMode) => void
  recommended: boolean
  presetLabel?: MessageDescriptor
  accent?: PresetAccent
  labels: Record<FigureExtractionMode, string>
}) {
  const { i18n, t } = useLingui()
  // eslint-disable-next-line lingui/no-unlocalized-strings -- ImageProcessingPreviewFocus key
  const { onMouseEnter, onMouseLeave } = useDelayedPreviewFocus("figureExtraction")

  return (
    <div
      className="flex w-full flex-col gap-3 rounded-lg border border-border bg-white px-4 py-3 shadow-sm"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold leading-5 text-foreground">{title}</p>
        {recommended ? (
          <span
            className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none"
            style={accent
              ? {
                  borderColor: `${accent.bg}40`,
                  backgroundColor: `${accent.bg}10`,
                  color: accent.text,
                }
              : { borderColor: "#e5e5e5", backgroundColor: "#f5f5f5", color: "#525252" }}
          >
            {presetLabel ? t`Auto recommended for ${i18n._(presetLabel)}` : t`Auto recommended`}
          </span>
        ) : null}
      </div>
      <p className="text-xs font-normal leading-4 text-muted-foreground">{subtitle}</p>
      <SegmentedControl
        options={[
          { value: "off", label: labels.off },
          { value: "auto", label: labels.auto },
          { value: "all", label: labels.all },
        ]}
        value={value}
        onValueChange={onValueChange}
        color={accent?.bg}
      />
    </div>
  )
}
