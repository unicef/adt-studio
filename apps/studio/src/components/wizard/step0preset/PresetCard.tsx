import { useId } from "react"
import { Settings } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import {
  type PresetConfig,
  type PresetId,
  getPresetAccent,
  getPresetRecommendationEntries,
} from "@/components/wizard/constants"

function DefaultsHoverCard({ preset }: { preset: PresetConfig }) {
  const { i18n } = useLingui()
  const entries = getPresetRecommendationEntries(preset.recommendations)

  if (entries.length === 0) {
    return (
      <HoverCardContent side="bottom" align="end" className="w-[280px] p-4">
        <p className="text-sm text-muted-foreground text-center">
          <Trans>No preset defaults — all options start empty.</Trans>
        </p>
      </HoverCardContent>
    )
  }

  return (
    <HoverCardContent side="bottom" align="end" className="w-[280px] p-0">
      <div className="flex flex-col">
        {entries.map((entry, idx) => (
          <div
            key={`${idx}-${i18n._(entry.label)}`}
            className={cn(
              "flex items-center justify-between px-4 py-2.5",
              idx > 0 && "border-t border-border",
            )}
          >
            <span className="text-xs font-medium text-muted-foreground">
              {i18n._(entry.label)}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {typeof entry.value === "string" ? entry.value : i18n._(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </HoverCardContent>
  )
}

interface PresetCardProps {
  preset: PresetConfig
  selected: boolean
  radioName: string
  onSelect: (id: PresetId) => void
  onShowExamples: (id: PresetId) => void
}

export function PresetCard({
  preset,
  selected,
  radioName,
  onSelect,
  onShowExamples,
}: PresetCardProps) {
  const { i18n } = useLingui()
  const { Icon } = preset
  const radioId = useId()
  const defaultEntries = getPresetRecommendationEntries(preset.recommendations)
  const accent = getPresetAccent(preset.id)

  return (
    <label
      className={cn(
        "block w-full rounded-lg p-1 text-left transition-all cursor-pointer",
        "border border-border outline-none",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-0",
        !selected && "hover:border-border",
      )}
      style={
        selected
          ? { boxShadow: `0 0 0 2px ${accent.bg}`, transition: "box-shadow 0.3s ease" }
          : { transition: "box-shadow 0.3s ease" }
      }
    >
      <input
        id={radioId}
        type="radio"
        name={radioName}
        value={preset.id}
        checked={selected}
        onChange={() => onSelect(preset.id)}
        className="sr-only"
        aria-label={i18n._(preset.title)}
      />
      <span className="block">
      <div
        className={`h-[200px] w-full rounded overflow-hidden flex items-center justify-center ${preset.bgColor}`}
      >
        {preset.imageSrc ? (
          <img
            src={preset.imageSrc}
            alt={i18n._(preset.title)}
            className="w-[163px] h-[168px] object-contain"
          />
        ) : preset.id === "custom" ? (
          <Icon
            className={`size-24 ${preset.iconColor} opacity-60`}
            strokeWidth={1.5}
          />
        ) : (
          <Icon className="w-full h-full" />
        )}
      </div>

      <div className="px-4 pt-4 pb-3 flex flex-col gap-2">
        <span className="text-sm font-bold text-foreground leading-5">
          {i18n._(preset.title)}
        </span>
        <span className="text-[10px] text-muted-foreground leading-[14px] line-clamp-3">
          {i18n._(preset.description)}
        </span>

        <div
          className="flex items-center justify-end mt-1"
          style={{ visibility: preset.id === "custom" ? "hidden" : "visible" }}
        >
          {/* "See examples" hidden for now */}

          <HoverCard openDelay={150} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 cursor-pointer hover:border-brand-600/50 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Settings className="h-3.5 w-3.5 text-foreground" />
                <span className="text-xs font-semibold text-foreground leading-4">
                  {defaultEntries.length}
                </span>
              </div>
            </HoverCardTrigger>
            <DefaultsHoverCard preset={preset} />
          </HoverCard>
        </div>
      </div>
      </span>
    </label>
  )
}
