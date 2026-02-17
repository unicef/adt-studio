import { useState, useEffect, useRef, useMemo } from "react"
import { Check, Languages, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { SUPPORTED_LANGUAGES, LANG_MAP } from "@/lib/languages"

export function LanguagePicker({
  selected,
  onSelect,
  multiple,
  label,
  hint,
}: {
  selected: string | Set<string>
  onSelect: (code: string) => void
  multiple?: boolean
  label: string
  hint?: string
}) {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!search) return SUPPORTED_LANGUAGES
    const q = search.toLowerCase()
    return SUPPORTED_LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    )
  }, [search])

  const isSelected = (code: string) =>
    typeof selected === "string" ? selected === code : selected.has(code)

  const selectedSet =
    typeof selected === "string" ? null : selected

  const displayValue =
    typeof selected === "string"
      ? LANG_MAP.get(selected) ?? selected
      : null

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleSelect = (code: string) => {
    onSelect(code)
    if (!multiple) {
      setOpen(false)
      setSearch("")
    } else {
      // Keep focus on input for continued selection
      inputRef.current?.focus()
    }
  }

  return (
    <div className="space-y-2">
      {(label || hint) && (
        <div>
          {label && <Label className="text-xs">{label}</Label>}
          {hint && (
            <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
          )}
        </div>
      )}

      {/* Selected badges for multi-select */}
      {multiple && selectedSet && selectedSet.size > 0 && (
        <div className="flex flex-wrap gap-1">
          {Array.from(selectedSet).map((code) => (
            <Badge
              key={code}
              variant="secondary"
              className="gap-1 pr-1 text-xs font-normal"
            >
              {LANG_MAP.get(code) ?? code}
              <button
                type="button"
                onClick={() => onSelect(code)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div ref={containerRef} className="relative">
        <Languages className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground z-10" />
        <Input
          ref={inputRef}
          value={open ? search : search || (!multiple ? displayValue ?? "" : "")}
          onChange={(e) => {
            setSearch(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            multiple
              ? "Search languages..."
              : displayValue
                ? `${displayValue} — type to change`
                : "Search languages..."
          }
          className="pl-8 h-8 text-xs"
        />

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            <div className="max-h-48 overflow-y-auto p-1">
              {filtered.map((lang) => {
                const active = isSelected(lang.code)
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleSelect(lang.code)}
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center">
                      {active && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span>{lang.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {lang.code}
                    </span>
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No languages match &ldquo;{search}&rdquo;
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
