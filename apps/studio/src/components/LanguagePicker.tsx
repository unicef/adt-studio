import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Check, Languages, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  SUPPORTED_LANGUAGES,
  getDisplayName,
  findLanguage,
  getCountriesForLanguage,
  normalizeLocale,
  type Language,
} from "@/lib/languages"

interface DropdownItem {
  code: string
  label: string
  sublabel: string
}

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
  // Phase 1: picking a language. Phase 2: picking a country for lockedLang.
  const [lockedLang, setLockedLang] = useState<Language | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const normalizedSelected = useMemo(
    () =>
      typeof selected === "string"
        ? normalizeLocale(selected)
        : new Set(Array.from(selected).map((code) => normalizeLocale(code))),
    [selected]
  )

  const selectedSet = typeof selected === "string" ? null : selected

  const selectedCode = typeof selected === "string" ? normalizeLocale(selected) : null

  const isSelected = (code: string) => {
    const normalized = normalizeLocale(code)
    return typeof normalizedSelected === "string"
      ? normalizedSelected === normalized
      : normalizedSelected.has(normalized)
  }

  const displayValue = selectedCode ? getDisplayName(selectedCode) || selectedCode : null

  // Build dropdown items based on phase
  const items: DropdownItem[] = useMemo(() => {
    if (lockedLang) {
      // Phase 2: show base language first, then suggested countries, then all others
      const q = search.toLowerCase()
      const { suggested, all } = getCountriesForLanguage(lockedLang.code)
      const result: DropdownItem[] = [
        { code: lockedLang.code, label: lockedLang.name, sublabel: lockedLang.code },
      ]
      const addCountry = (c: { code: string; name: string }) => {
        if (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) {
          const locale = `${lockedLang.code}-${c.code.toUpperCase()}`
          result.push({
            code: locale,
            label: `${lockedLang.name} (${c.name})`,
            sublabel: locale,
          })
        }
      }
      for (const c of suggested) addCountry(c)
      for (const c of all) addCountry(c)
      return result
    }
    // Phase 1: show languages
    const q = search.toLowerCase()
    return SUPPORTED_LANGUAGES.filter(
      (l) =>
        !q || l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    ).map((l) => ({
      code: l.code,
      label: l.name,
      sublabel: l.code,
    }))
  }, [search, lockedLang])

  // Reset highlight when items change — skip the base language entry when filtering countries
  useEffect(() => {
    setHighlighted(lockedLang && search && items.length > 1 ? 1 : 0)
  }, [items])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[highlighted] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [highlighted])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setSearch("")
    setLockedLang(null)
    setHighlighted(0)
  }, [])

  const commit = useCallback(
    (code: string) => {
      onSelect(normalizeLocale(code))
      if (!multiple) {
        close()
      } else {
        setSearch("")
        setLockedLang(null)
        setHighlighted(0)
        inputRef.current?.focus()
      }
    },
    [onSelect, multiple, close]
  )

  const lockLanguage = useCallback(
    (lang: Language) => {
      // Always enter phase 2 — any language can be paired with any country
      setLockedLang(lang)
      setSearch("")
      setHighlighted(0)
    },
    []
  )

  const clearSelection = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onSelect("")
      close()
    },
    [onSelect, close]
  )

  const handleItemClick = (item: DropdownItem) => {
    if (!lockedLang) {
      // Phase 1: clicking a language
      const lang = findLanguage(item.code)
      if (lang) lockLanguage(lang)
      else commit(item.code)
    } else {
      // Phase 2: clicking a country or the base language
      commit(item.code)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlighted((h) => Math.min(h + 1, items.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlighted((h) => Math.max(h - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (items.length > 0) {
          const item = items[highlighted]
          handleItemClick(item)
        }
        break
      case " ":
        // Space in phase 1 locks the highlighted language (enters phase 2)
        if (!lockedLang && items.length > 0) {
          e.preventDefault()
          const item = items[highlighted]
          const lang = findLanguage(item.code)
          if (lang) lockLanguage(lang)
        }
        // In phase 2 or if no match, let space type normally
        break
      case "Backspace":
        if (lockedLang && search === "") {
          // Go back to phase 1
          e.preventDefault()
          setLockedLang(null)
          setSearch("")
        }
        break
      case "Escape":
        e.preventDefault()
        if (lockedLang) {
          setLockedLang(null)
          setSearch("")
        } else {
          close()
        }
        break
    }
  }

  const inputDisplay = () => {
    if (open) return search
    if (!multiple && displayValue) return displayValue
    return ""
  }

  const placeholderText = () => {
    if (open && lockedLang) return `${lockedLang.name} — type country or Enter for base`
    return "Search languages..."
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
              {getDisplayName(code) || code}
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
        {/* Locked language chip shown inside the input area */}
        {open && lockedLang && (
          <span className="absolute left-8 top-1/2 -translate-y-1/2 text-xs bg-accent text-accent-foreground rounded px-1.5 py-0.5 z-10 pointer-events-none">
            {lockedLang.name}
          </span>
        )}
        <Input
          ref={inputRef}
          value={inputDisplay()}
          onChange={(e) => {
            setSearch(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText()}
          className={`h-8 text-xs ${lockedLang && open ? "pl-[calc(var(--chip-offset,5rem)+0.75rem)]" : "pl-8"} ${!multiple && selectedCode ? "pr-16" : ""}`}
          style={
            lockedLang && open
              ? { paddingLeft: `calc(${lockedLang.name.length * 0.55}rem + 2.5rem)` }
              : undefined
          }
        />
        {!multiple && selectedCode && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {!open && (
              <span className="text-[10px] text-muted-foreground pointer-events-none">
                {selectedCode}
              </span>
            )}
            <button
              type="button"
              aria-label="Clear language"
              onClick={clearSelection}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            <div ref={listRef} className="max-h-48 overflow-y-auto p-1">
              {items.map((item, i) => {
                const active = isSelected(item.code)
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors ${
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : i === highlighted
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center">
                      {active && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span>{item.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {item.sublabel}
                    </span>
                  </button>
                )
              })}
              {items.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No matches for &ldquo;{search}&rdquo;
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
