import { useLingui } from "@lingui/react"
import { useLingui as useLinguiMacro } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { DEFAULT_READER_COLORS, type ReaderColorTokens } from "@adt/types"
import { cn } from "@/lib/utils"
import type { ReaderUiDraft } from "../hooks/use-reader-ui-draft"
import {
  READER_THEME_PRESETS,
  applyThemePreset,
  matchThemePreset,
  type ReaderThemePreset,
} from "../lib/presets"
import { READER_STEP_ACCENT } from "../lib/accent"
import { fontStack } from "./ShapeControls"

function pick(tokens: ReaderColorTokens, key: keyof ReaderColorTokens): string {
  return tokens[key] ?? DEFAULT_READER_COLORS.light[key]
}

/** A tiny rendering of the dock in a theme: surface, text, highlight, primary. */
export function ThemeSwatch({ preset, className }: { preset: ReaderThemePreset; className?: string }) {
  const { t } = useLinguiMacro()
  const light = preset.light
  return (
    <div
      aria-hidden
      className={cn("flex items-center gap-1.5 p-2 shadow-sm ring-1 ring-black/10", className)}
      style={{
        background: pick(light, "popover"),
        color: pick(light, "popover-foreground"),
        borderRadius: `${preset.radius}rem`,
        fontFamily: fontStack(preset.font),
      }}
    >
      <span
        className="flex h-6 w-6 items-center justify-center text-[10px] font-bold"
        style={{ background: pick(light, "accent"), color: pick(light, "accent-foreground"), borderRadius: `${Math.max(0.15, preset.radius - 0.25)}rem` }}
      >
        {t`Aa`}
      </span>
      <span className="h-1.5 flex-1 rounded-full opacity-30" style={{ background: pick(light, "popover-foreground") }} />
      <span
        className="h-6 w-9"
        style={{ background: pick(light, "primary"), borderRadius: `${Math.max(0.15, preset.radius - 0.25)}rem` }}
      />
    </div>
  )
}

interface GridProps {
  draft: ReaderUiDraft
  columns?: 1 | 2 | 3
  size?: "sm" | "md"
  className?: string
}

export function ThemePresetGrid({ draft, columns = 2, size = "md", className }: GridProps) {
  const { i18n } = useLingui()
  const active = matchThemePreset(draft.value)
  return (
    <div
      className={cn("grid gap-2", columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : "grid-cols-3", className)}
      role="radiogroup"
    >
      {READER_THEME_PRESETS.map((preset) => {
        const selected = active === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => draft.replace(applyThemePreset(draft.value, preset))}
            className={cn(
              "group relative flex flex-col gap-2 rounded-lg border bg-card p-2 text-left transition-shadow hover:shadow-md",
              selected && "border-transparent",
            )}
            style={selected ? { boxShadow: `0 0 0 2px ${READER_STEP_ACCENT}` } : undefined}
          >
            <ThemeSwatch preset={preset} />
            <div className="min-w-0 px-0.5">
              <div className="truncate text-xs font-medium">{i18n._(preset.label)}</div>
              {size === "md" ? (
                <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {i18n._(preset.description)}
                </div>
              ) : null}
            </div>
            {selected ? (
              <span
                className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-white"
                style={{ background: READER_STEP_ACCENT }}
              >
                <Check className="h-3 w-3" />
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

