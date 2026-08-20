import {
  useEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type SVGProps,
} from "react"
import { LayoutGrid, Square } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export interface BoxValue {
  /** top — or top-left when `variant="corners"` */
  t: number
  /** right — or top-right when `variant="corners"` */
  r: number
  /** bottom — or bottom-right when `variant="corners"` */
  b: number
  /** left — or bottom-left when `variant="corners"` */
  l: number
}

export type BoxInputVariant = "sides" | "corners"

interface BoxInputProps {
  value: BoxValue
  onChange: (next: BoxValue) => void
  variant?: BoxInputVariant
  unit?: string
}

const SIDE_LABELS: Record<BoxInputVariant, [string, string, string, string]> = {
  sides: ["T", "R", "B", "L"],
  // eslint-disable-next-line lingui/no-unlocalized-strings -- universal corner abbreviations
  corners: ["TL", "TR", "BR", "BL"],
}

export function BoxInput({
  value,
  onChange,
  variant = "sides",
  unit = "px",
}: BoxInputProps) {
  const { t } = useLingui()
  const allEqual =
    value.t === value.r && value.r === value.b && value.b === value.l
  const [mode, setMode] = useState<"single" | "split">(
    allEqual ? "single" : "split"
  )
  const [focusedSide, setFocusedSide] = useState<keyof BoxValue | null>(null)

  const splitIcon = !focusedSide ? (
    <LayoutGrid className="h-3.5 w-3.5" />
  ) : variant === "sides" ? (
    <SideEmphasisIcon side={focusedSide} className="h-3.5 w-3.5" />
  ) : (
    <CornerEmphasisIcon corner={focusedSide} className="h-3.5 w-3.5" />
  )

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center gap-1">
        <div className="relative flex-1 min-w-0">
          <NumericInput
            value={value.t}
            onCommit={(n) => onChange({ t: n, r: n, b: n, l: n })}
            disabled={mode === "split"}
            className={cn(
              "h-8 w-full bg-muted/60 rounded-md px-2 pr-8 text-[12px] tabular-nums outline-none",
              "focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          />
          {unit ? (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/70 select-none pointer-events-none">
              {unit}
            </span>
          ) : null}
        </div>
        <ToggleGroup
          type="single"
          size="xs"
          sliding
          value={mode}
          onValueChange={(v) => v && setMode(v as "single" | "split")}
          className="w-auto shrink-0"
        >
          <ToggleGroupItem value="single" title={t`Single value`}>
            <Square className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="split" title={t`Individual sides`}>
            {splitIcon}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div
        className={cn(
          "grid grid-cols-4 gap-1 overflow-hidden transition-all duration-300 ease-in-out",
          mode === "split"
            ? "opacity-100 max-h-24 mt-2 mb-1"
            : "opacity-0 max-h-0 mt-0 mb-0 pointer-events-none"
        )}
      >
        {(["t", "r", "b", "l"] as const).map((side, i) => (
          <SideField
            key={side}
            label={SIDE_LABELS[variant][i]}
            value={value[side]}
            onCommit={(n) => onChange({ ...value, [side]: n })}
            onFocus={() => setFocusedSide(side)}
            onBlur={() => setFocusedSide(null)}
          />
        ))}
      </div>
    </div>
  )
}

function SideField({
  label,
  value,
  onCommit,
  onFocus,
  onBlur,
}: {
  label: string
  value: number
  onCommit: (n: number) => void
  onFocus?: FocusEventHandler<HTMLInputElement>
  onBlur?: FocusEventHandler<HTMLInputElement>
}) {
  return (
    <div className="flex flex-col items-stretch gap-0.5 min-w-0">
      <NumericInput
        value={value}
        onCommit={onCommit}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cn(
          "h-7 w-full bg-muted/60 rounded-md px-1.5 text-[11px] tabular-nums text-center outline-none",
          "focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500"
        )}
      />
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 text-center select-none">
        {label}
      </span>
    </div>
  )
}

const COMMIT_DEBOUNCE_MS = 200

// Empty draft commits as 0; commits debounce while typing, blur/Enter flush.
function NumericInput({
  value,
  onCommit,
  disabled,
  className,
  onFocus,
  onBlur,
}: {
  value: number
  onCommit: (n: number) => void
  disabled?: boolean
  className?: string
  onFocus?: FocusEventHandler<HTMLInputElement>
  onBlur?: FocusEventHandler<HTMLInputElement>
}) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync from parent only while idle so it can't clobber typing in progress.
  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const flush = (raw: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const n = raw.trim() === "" ? 0 : parseFloat(raw)
    if (Number.isFinite(n) && n !== value) {
      onCommit(n)
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      placeholder="0"
      disabled={disabled}
      onFocus={(e) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        flush(draft)
        onBlur?.(e)
      }}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          flush(next)
        }, COMMIT_DEBOUNCE_MS)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur()
        else if (e.key === "Escape") {
          setDraft(String(value))
          ;(e.currentTarget as HTMLInputElement).blur()
        }
      }}
      className={className}
    />
  )
}

function FaintOutline(props: SVGProps<SVGRectElement>) {
  return (
    <rect
      x="4"
      y="4"
      width="16"
      height="16"
      rx="2"
      strokeWidth="1.5"
      opacity="0.35"
      {...props}
    />
  )
}

const SVG_BASE: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  // eslint-disable-next-line lingui/no-unlocalized-strings -- SVG attribute keyword
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
}

function SideEmphasisIcon({
  side,
  className,
}: {
  side: keyof BoxValue
  className?: string
}) {
  return (
    <svg {...SVG_BASE} className={className}>
      <FaintOutline />
      {side === "t" && <line x1="4" y1="4" x2="20" y2="4" strokeWidth="3" />}
      {side === "r" && <line x1="20" y1="4" x2="20" y2="20" strokeWidth="3" />}
      {side === "b" && <line x1="4" y1="20" x2="20" y2="20" strokeWidth="3" />}
      {side === "l" && <line x1="4" y1="4" x2="4" y2="20" strokeWidth="3" />}
    </svg>
  )
}

// `corner` reuses BoxValue keys: t→TL, r→TR, b→BR, l→BL.
function CornerEmphasisIcon({
  corner,
  className,
}: {
  corner: keyof BoxValue
  className?: string
}) {
  return (
    <svg {...SVG_BASE} className={className}>
      <FaintOutline />
      {corner === "t" && (
        <path d="M4 10c0-3.3 2.7-6 6-6" strokeWidth="3" />
      )}
      {corner === "r" && (
        <path d="M14 4c3.3 0 6 2.7 6 6" strokeWidth="3" />
      )}
      {corner === "b" && (
        <path d="M20 14c0 3.3-2.7 6-6 6" strokeWidth="3" />
      )}
      {corner === "l" && (
        <path d="M10 20c-3.3 0-6-2.7-6-6" strokeWidth="3" />
      )}
    </svg>
  )
}
