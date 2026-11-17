import { useLingui } from "@lingui/react/macro"
import {
  DEFAULT_READER_RADIUS,
  READER_FONT_STACKS,
  READER_FONTS,
  READER_RADIUS_MAX,
  READER_RADIUS_MIN,
  type ReaderFont,
} from "@adt/types"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type { ReaderUiDraft } from "../hooks/use-reader-ui-draft"
import { READER_STEP_ACCENT } from "../lib/accent"

interface ShapeControlsProps {
  draft: ReaderUiDraft
  part?: "radius" | "font" | "all"
  className?: string
}

export function fontStack(font: ReaderFont): string | undefined {
  return font === "default" ? undefined : READER_FONT_STACKS[font]
}

/** Corner radius (shadcn `--radius`) and the chrome's typeface. */
export function ShapeControls({ draft, part = "all", className }: ShapeControlsProps) {
  const { t } = useLingui()
  const radius = draft.value.radius ?? DEFAULT_READER_RADIUS
  const font = draft.value.font ?? "default"
  const fontLabels: Record<ReaderFont, string> = {
    default: t`System`,
    rounded: t`Rounded`,
    serif: t`Serif`,
    mono: t`Mono`,
  }
  const radiusLabel = `${radius.toFixed(3).replace(/\.?0+$/, "")}rem`

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {part !== "font" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{t`Corner radius`}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{radiusLabel}</span>
          </div>
          <Slider
            color={READER_STEP_ACCENT}
            min={READER_RADIUS_MIN}
            max={READER_RADIUS_MAX}
            step={0.125}
            value={[radius]}
            onValueChange={([next]) => draft.setRadius(next)}
            aria-label={t`Corner radius`}
          />
          <div className="flex items-end gap-2" aria-hidden>
            {[0.6, 1, 1.6].map((factor) => (
              <div
                key={factor}
                className="border-2 bg-muted/40"
                style={{
                  borderColor: READER_STEP_ACCENT,
                  width: `${2.25 * factor}rem`,
                  height: "1.75rem",
                  borderRadius: `${radius}rem`,
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {part !== "radius" ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">{t`Typeface`}</span>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t`Typeface`}>
            {READER_FONTS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={font === option}
                onClick={() => draft.setFont(option)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md border px-1 py-2 transition-colors",
                  font === option ? "border-transparent ring-2" : "hover:bg-muted",
                )}
                style={font === option ? { boxShadow: `0 0 0 2px ${READER_STEP_ACCENT}` } : undefined}
              >
                <span className="text-lg leading-none" style={{ fontFamily: fontStack(option) }}>
                  {t`Aa`}
                </span>
                <span className="text-[10px] text-muted-foreground">{fontLabels[option]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
