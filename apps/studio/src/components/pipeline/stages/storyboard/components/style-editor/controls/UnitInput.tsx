import { useContext, useEffect, useRef, useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { StyleLabelContext } from "./StyleLabel"

const COMMIT_DEBOUNCE_MS = 200

/**
 * Numeric value paired with a unit token.
 * - For numeric units (`px`, `%`, etc.): `value` is the digits, `unit` is the token.
 * - For keyword units (`auto`, `none`, etc.): `value` mirrors the unit and the
 *   input is disabled. Mirrors lowcode-studio's UnitInput shape.
 */
export interface UnitValue {
  value: string
  unit: string
}

const KEYWORD_UNITS = new Set(["auto", "none", "min-content", "max-content", "fit"])

interface UnitInputProps {
  value: UnitValue
  onChange: (next: UnitValue) => void
  /** Available units. Defaults to ["px", "%"]. Keywords like "auto"/"none" are also supported. */
  units?: ReadonlyArray<string>
  placeholder?: string
}

export function UnitInput({
  value,
  onChange,
  units = ["px", "%"],
  placeholder = "0",
}: UnitInputProps) {
  const labelledBy = useContext(StyleLabelContext)
  const [draft, setDraft] = useState(value.value)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!focused) setDraft(value.value)
  }, [value.value, focused])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const isKeyword = KEYWORD_UNITS.has(value.unit)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const commit = (next: string) => {
    if (next === value.value) return
    onChange({ value: next, unit: value.unit })
  }

  const handleInput = (raw: string) => {
    if (isKeyword) return
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return
    let next = raw
    if (raw !== "" && value.unit === "%") {
      const n = parseFloat(raw)
      if (!Number.isNaN(n)) {
        if (n < 0) next = "0"
        else if (n > 100) next = "100"
      }
    }
    setDraft(next)
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      commit(next)
    }, COMMIT_DEBOUNCE_MS)
  }

  const handleUnitChange = (newUnit: string) => {
    setOpen(false)
    if (newUnit === value.unit) return
    clearTimer()
    if (KEYWORD_UNITS.has(newUnit)) {
      onChange({ value: newUnit, unit: newUnit })
    } else {
      const carryValue = isKeyword ? "" : draft
      onChange({ value: carryValue, unit: newUnit })
    }
  }

  const displayValue = isKeyword ? value.unit : draft

  return (
    <div className="relative w-full min-w-0">
      <input
        type="text"
        inputMode="decimal"
        aria-labelledby={labelledBy}
        value={displayValue}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          clearTimer()
          commit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            ;(e.currentTarget as HTMLInputElement).blur()
          } else if (e.key === "Escape") {
            clearTimer()
            setDraft(value.value)
            ;(e.currentTarget as HTMLInputElement).blur()
          }
        }}
        disabled={isKeyword}
        placeholder={placeholder}
        className={cn(
          "h-8 w-full bg-muted/60 rounded-md pl-2 pr-10 text-[12px] tabular-nums outline-none",
          "focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500",
          isKeyword && "italic text-muted-foreground"
        )}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={value.unit}
            className={cn(
              "absolute top-0 right-0 h-8 w-9 flex items-center justify-center text-[11px] font-medium rounded-r-md cursor-pointer",
              "transition-colors text-muted-foreground hover:text-foreground"
            )}
          >
            {isKeyword ? (
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            ) : (
              value.unit
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto min-w-16 p-1 rounded-md"
          align="end"
          sideOffset={4}
        >
          <div className="flex flex-col">
            {units.map((u) => {
              const active = u === value.unit
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => handleUnitChange(u)}
                  className={cn(
                    "h-7 px-2 rounded text-[11px] text-center transition-colors cursor-pointer",
                    active
                      ? "bg-violet-50 text-violet-600 font-semibold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {u}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
