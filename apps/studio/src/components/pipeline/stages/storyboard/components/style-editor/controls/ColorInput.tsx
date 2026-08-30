import { cn } from "@/lib/utils"
import { ColorPicker } from "./ColorPicker"
import { hexFromTailwindName } from "../tailwind-palette"

interface ColorInputProps {
  /** Hex (`#abc123`) or Tailwind token (`violet-500`). */
  value: string
  onChange: (next: string) => void
  className?: string
}

const TRANSPARENT_PATTERN =
  "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)"

/**
 * Field-row color input. The whole row is the picker trigger: it shows a
 * swatch + the current value (hex or Tailwind token) and opens the two-tab
 * `ColorPicker` popover on click. Direct hex editing happens inside the
 * picker's Custom tab — the row itself is read-only.
 */
export function ColorInput({ value, onChange, className }: ColorInputProps) {
  const previewHex = resolveHex(value)
  const display = value || "—"

  return (
    <ColorPicker value={value} onChange={onChange}>
      <button
        type="button"
        aria-label={value}
        className={cn(
          "group relative flex items-center gap-2 h-8 w-full bg-muted/60 rounded-md pl-1.5 pr-2 cursor-pointer outline-none",
          "hover:bg-muted/80 transition-colors",
          "data-[state=open]:bg-background data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-violet-500",
          "focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500",
          className
        )}
      >
        <span
          className="inline-block h-5 w-5 shrink-0 overflow-hidden rounded border border-border/60"
          style={
            previewHex === "transparent"
              ? {
                  backgroundImage: TRANSPARENT_PATTERN,
                  backgroundSize: "6px 6px",
                  backgroundPosition: "0 0, 3px 3px",
                }
              : { backgroundColor: previewHex }
          }
        />
        <span className="flex-1 min-w-0 text-[12px] tabular-nums text-left truncate">
          {display}
        </span>
      </button>
    </ColorPicker>
  )
}

function resolveHex(value: string): string {
  if (!value) return "#000000"
  if (value === "transparent") return "transparent"
  // 6-digit (#abcdef) or 8-digit (#abcdefab — RGBA) hex pass through.
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return value
  return hexFromTailwindName(value) ?? "#000000"
}
