import { useId, type KeyboardEvent, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { ColorPicker } from "@/components/pipeline/stages/storyboard/components/style-editor/controls/ColorPicker"
import { hexFromTailwindName } from "@/components/pipeline/stages/storyboard/components/style-editor/tailwind-palette"

export interface ChoiceOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T | null
  options: ReadonlyArray<ChoiceOption<T>>
  onChange: (value: T) => void
  className?: string
}) {
  const focusIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (focusIndex + step + options.length) % options.length
    onChange(options[next].value)
    event.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {options.map((option, index) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            aria-label={option.title}
            tabIndex={index === focusIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-7 min-w-0 items-center justify-center gap-1 rounded-md px-1.5 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/15 dark:bg-white/12 dark:ring-white/25"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const BASIC_COLORS: ReadonlyArray<{ name: string; label: MessageDescriptor }> = [
  { name: "black", label: msg`Black` },
  { name: "gray-600", label: msg`Grey` },
  { name: "red-700", label: msg`Red` },
  { name: "blue-700", label: msg`Blue` },
  { name: "green-700", label: msg`Green` },
  { name: "amber-500", label: msg`Amber` },
]

export function toHex(value: string): string | null {
  if (!value) return null
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value.slice(0, 7).toLowerCase()
  return hexFromTailwindName(value)?.toLowerCase() ?? null
}

function Swatch({
  color,
  active,
  label,
  onClick,
}: {
  color: string
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-card transition-[box-shadow,transform] duration-150 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        active ? "ring-2 ring-brand-500" : "",
      )}
    >
      <span className="absolute inset-0 rounded-full border border-foreground/15" style={{ backgroundColor: color }} />
      {active ? <Check aria-hidden className="relative size-3.5 text-white mix-blend-difference" /> : null}
    </button>
  )
}

export function ColorSwatches({
  label,
  value,
  palette,
  onChange,
}: {
  label: string
  value: string
  palette: string[]
  onChange: (value: string) => void
}) {
  const { t, i18n } = useLingui()
  const groupId = useId()
  const current = toHex(value)
  const bookHexes = new Set(palette)
  const basics = BASIC_COLORS.flatMap((color) => {
    const hex = hexFromTailwindName(color.name)?.toLowerCase()
    return hex && !bookHexes.has(hex) ? [{ ...color, hex }] : []
  })
  const known = new Set([...palette, ...basics.map((color) => color.hex)])
  const custom = current && !known.has(current) ? current : null

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          onClick={() => onChange("")}
          title={t`Use the book's colour`}
          className={cn(
            "h-7 rounded-full border px-2.5 text-[11.5px] font-medium transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
            !value ? "border-brand-300 bg-brand-50 text-brand-700" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Trans>Default</Trans>
        </button>
        {palette.map((hex) => (
          <Swatch key={hex} color={hex} active={current === hex} label={t`Book colour ${hex}`} onClick={() => onChange(hex)} />
        ))}
        {palette.length > 0 ? (
          <span className="ml-1 text-[10.5px] text-muted-foreground/80">
            <Trans>from this book</Trans>
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {basics.map((color) => (
          <Swatch
            key={color.name}
            color={color.hex}
            active={current === color.hex}
            label={i18n._(color.label)}
            onClick={() => onChange(color.name)}
          />
        ))}
        {custom ? <Swatch color={custom} active label={t`Custom colour ${custom}`} onClick={() => onChange(custom)} /> : null}
        <ColorPicker value={value} onChange={onChange} align="end">
          <button
            type="button"
            aria-label={t`Pick a custom colour`}
            title={t`Pick a custom colour`}
            aria-describedby={groupId}
            className="grid size-7 place-items-center rounded-full border border-dashed border-foreground/30 text-muted-foreground transition-colors duration-150 hover:border-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Plus aria-hidden className="size-3.5" />
          </button>
        </ColorPicker>
      </div>
      <span id={groupId} className="sr-only">
        <Trans>Opens the full colour picker.</Trans>
      </span>
    </div>
  )
}
