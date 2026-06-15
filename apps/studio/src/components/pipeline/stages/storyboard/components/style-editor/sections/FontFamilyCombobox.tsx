import { useMemo, useRef, useState } from "react"
import { Check, ChevronsUpDown, CloudDownload, Loader2, Search, TriangleAlert } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import type { BookFontWithStatus } from "@/api/client"
import { POPULAR_GOOGLE_FONTS } from "../../../popular-google-fonts"

const GENERIC_FALLBACK: Record<string, string> = {
  serif: "serif",
  sans: "sans-serif",
  handwriting: "cursive",
  mono: "monospace",
  display: "sans-serif",
}

function previewFamily(family: string, category?: string | null): string {
  return `'${family}', ${GENERIC_FALLBACK[category ?? "sans"] ?? "sans-serif"}`
}

function isRestricted(font: BookFontWithStatus): boolean {
  return !!(font.license?.embeddingRestricted || font.license?.openSource === false)
}

interface FontRowProps {
  label: string
  fontFamily?: string
  selected?: boolean
  restricted?: boolean
  pending?: boolean
  onSelect: () => void
}

function FontRow({ label, fontFamily, selected, restricted, pending, onSelect }: FontRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        selected && "bg-violet-50",
      )}
    >
      <span className="w-4 shrink-0">
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : selected ? (
          <Check className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
        ) : null}
      </span>
      <span className="truncate" style={fontFamily ? { fontFamily } : undefined}>
        {label}
      </span>
      {restricted ? (
        <TriangleAlert
          className="ml-auto h-3.5 w-3.5 shrink-0 text-destructive"
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}

export interface FontFamilyComboboxProps {
  /** Selected BookFont id, or "" for the inherited body font. */
  value: string
  fonts: BookFontWithStatus[]
  /** Google family currently being attached (shows a spinner on its row). */
  pendingFamily: string | null
  /** An attached font id was picked ("" resets to the inherited body font). */
  onSelectFont: (id: string) => void
  /** A Google family was picked — attach it (if needed) and apply. */
  onSelectGoogle: (family: string) => void
  onBrowse: () => void
  onOpenChange?: (open: boolean) => void
}

export function FontFamilyCombobox({
  value,
  fonts,
  pendingFamily,
  onSelectFont,
  onSelectGoogle,
  onBrowse,
  onOpenChange,
}: FontFamilyComboboxProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedFont = fonts.find((f) => f.id === value) ?? null
  const triggerLabel = selectedFont ? selectedFont.family : t`Default (inherit)`
  const triggerFamily = selectedFont
    ? previewFamily(selectedFont.family, selectedFont.category)
    : undefined

  const attachedFamilies = useMemo(
    () => new Set(fonts.map((f) => f.family)),
    [fonts],
  )

  const q = query.trim().toLowerCase()
  const matches = (name: string) => name.toLowerCase().includes(q)

  const yourFonts = useMemo(
    () => (q ? fonts.filter((f) => matches(f.family)) : fonts),
    [fonts, q],
  )
  const googleFonts = useMemo(
    () =>
      POPULAR_GOOGLE_FONTS.filter(
        (family) => !attachedFamilies.has(family) && (!q || matches(family)),
      ),
    [attachedFamilies, q],
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
    if (!next) setQuery("")
  }

  const pick = (fn: () => void) => {
    fn()
    handleOpenChange(false)
  }

  const handleEnter = () => {
    if (yourFonts.length > 0) pick(() => onSelectFont(yourFonts[0].id))
    else if (googleFonts.length > 0) pick(() => onSelectGoogle(googleFonts[0]))
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center gap-1.5 rounded bg-muted/60 px-2 text-[12px]",
            "ring-offset-0 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-violet-500",
            "data-[state=open]:bg-background data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-violet-500",
          )}
        >
          <span className="truncate" style={triggerFamily ? { fontFamily: triggerFamily } : undefined}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[268px] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="border-b p-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleEnter()
              }
            }}
            placeholder={t`Search fonts`}
            prependIcon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
            className="h-8 text-[12px]"
          />
        </div>

        <div className="max-h-64 overflow-y-auto p-1.5">
          {!q ? (
            <FontRow
              label={t`Default (inherit)`}
              selected={!value}
              onSelect={() => pick(() => onSelectFont(""))}
            />
          ) : null}

          {yourFonts.length > 0 ? (
            <div className="mt-1">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                <Trans>Your fonts</Trans>
              </p>
              {yourFonts.map((f) => (
                <FontRow
                  key={f.id}
                  label={f.family}
                  fontFamily={
                    f.cached || f.source === "google"
                      ? previewFamily(f.family, f.category)
                      : undefined
                  }
                  selected={f.id === value}
                  restricted={isRestricted(f)}
                  onSelect={() => pick(() => onSelectFont(f.id))}
                />
              ))}
            </div>
          ) : null}

          {googleFonts.length > 0 ? (
            <div className="mt-1">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                <Trans>Google Fonts</Trans>
              </p>
              {googleFonts.map((family) => (
                <FontRow
                  key={family}
                  label={family}
                  fontFamily={previewFamily(family)}
                  pending={pendingFamily === family}
                  onSelect={() => pick(() => onSelectGoogle(family))}
                />
              ))}
            </div>
          ) : null}

          {yourFonts.length === 0 && googleFonts.length === 0 ? (
            <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
              <Trans>No fonts found</Trans>
            </p>
          ) : null}
        </div>

        <div className="border-t p-1.5">
          <button
            type="button"
            onClick={() => pick(onBrowse)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <CloudDownload className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Trans>Browse all Google Fonts…</Trans>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
