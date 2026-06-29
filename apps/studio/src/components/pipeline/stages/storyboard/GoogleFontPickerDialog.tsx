import { useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Check, Loader2, Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useGoogleFontsCatalog } from "@/hooks/use-book-fonts"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"

const COLS = 4
const CARD_H = 140
const ROW_GAP = 12
const ROW_H = CARD_H + ROW_GAP

const ALL = "all"
type SortKey = "popular" | "alpha" | "newest"

function previewCss2Url(family: string): string {
  const f = family.trim().replace(/\s+/g, "+")
  return `https://fonts.googleapis.com/css2?family=${f}&display=swap`
}

/** Searchable, virtualized Google Fonts catalog grid. Render inside a dialog or
 *  a tab; pass `active` to gate the (large) catalog fetch to when it's visible. */
export function GoogleFontPicker({
  active,
  existingFamilies,
  pendingFamily,
  onSelect,
}: {
  active: boolean
  existingFamilies: Set<string>
  pendingFamily: string | null
  onSelect: (family: string) => void
}) {
  const { t } = useLingui()
  const { data, isLoading, isError } = useGoogleFontsCatalog(active)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState(ALL)
  const [sort, setSort] = useState<SortKey>("popular")
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const requestedRef = useRef<Set<string>>(new Set())
  const [requested, setRequested] = useState<string[]>([])

  const families = useMemo(() => data?.families ?? [], [data])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const f of families) if (f.category) set.add(f.category)
    return [...set].sort()
  }, [families])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = families.filter((f) => {
      if (q && !f.family.toLowerCase().includes(q)) return false
      if (category !== ALL && f.category !== category) return false
      return true
    })
    const sorted = [...result]
    if (sort === "alpha") {
      sorted.sort((a, b) => a.family.localeCompare(b.family))
    } else if (sort === "newest") {
      sorted.sort((a, b) => (b.dateAdded ?? "").localeCompare(a.dateAdded ?? ""))
    } else {
      sorted.sort((a, b) => (a.popularity ?? Infinity) - (b.popularity ?? Infinity))
    }
    return sorted
  }, [families, query, category, sort])

  const rowCount = Math.ceil(filtered.length / COLS)
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_H,
    overscan: 4,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    let changed = false
    for (const row of virtualRows) {
      for (let col = 0; col < COLS; col++) {
        const entry = filtered[row.index * COLS + col]
        if (entry && !requestedRef.current.has(entry.family)) {
          requestedRef.current.add(entry.family)
          changed = true
        }
      }
    }
    if (changed) setRequested([...requestedRef.current])
  }, [virtualRows, filtered])

  useEffect(() => {
    rowVirtualizer.scrollToOffset(0)
  }, [query, category, sort, rowVirtualizer])

  return (
    <>
      {requested.map((family) => (
        <link key={family} rel="stylesheet" href={previewCss2Url(family)} />
      ))}

      <div className="mb-2 space-y-2">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Search fonts...`}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-auto min-w-[9rem] flex-1" aria-label={t`Category`}>
              <SelectValue placeholder={t`Category`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t`All categories`}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-auto min-w-[9rem] flex-1" aria-label={t`Sort by`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popular">{t`Popular`}</SelectItem>
              <SelectItem value="alpha">{t`A–Z`}</SelectItem>
              <SelectItem value="newest">{t`Newest`}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

        {isLoading ? (
          <div className="flex h-[50vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {t`Loading catalog...`}
          </div>
        ) : isError ? (
          <p className="flex h-[50vh] items-center justify-center text-sm text-destructive" role="alert">
            <Trans>Could not load the Google Fonts catalog. Check your connection and try again.</Trans>
          </p>
        ) : filtered.length === 0 ? (
          <p className="flex h-[50vh] items-center justify-center text-sm text-muted-foreground">
            <Trans>No fonts match your search.</Trans>
          </p>
        ) : (
          <div ref={setScrollEl} className="h-[50vh] overflow-y-auto pr-1">
            <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
              {virtualRows.map((row) => (
                <div
                  key={row.key}
                  className="absolute inset-x-0 grid grid-cols-4 gap-3"
                  style={{ top: row.start, height: CARD_H }}
                >
                  {Array.from({ length: COLS }, (_, col) => {
                    const entry = filtered[row.index * COLS + col]
                    if (!entry) return <div key={col} />
                    const added = existingFamilies.has(entry.family)
                    const pending = pendingFamily === entry.family
                    return (
                      <button
                        key={entry.family}
                        type="button"
                        onClick={() => onSelect(entry.family)}
                        disabled={added || pending}
                        className={cn(
                          "relative flex flex-col justify-between overflow-hidden rounded-lg border bg-card p-3 text-left transition-colors",
                          "hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          (added || pending) && "opacity-60",
                        )}
                      >
                        <span
                          className="line-clamp-2 break-words text-lg leading-snug"
                          style={{ fontFamily: `'${entry.family}', sans-serif` }}
                        >
                          {entry.family}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {entry.category ?? ""}
                          {entry.variants && entry.variants > 1
                            ? ` · ${entry.variants} ${t`styles`}`
                            : ""}
                        </span>
                        {added && (
                          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                            <Check className="h-3 w-3" aria-hidden="true" />
                            {t`Added`}
                          </span>
                        )}
                        {pending && (
                          <Loader2
                            className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && !isError && (
          <p className="text-xs text-muted-foreground">
            <Trans>{filtered.length} fonts</Trans>
          </p>
        )}
    </>
  )
}

export function GoogleFontPickerDialog({
  open,
  onOpenChange,
  existingFamilies,
  pendingFamily,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingFamilies: Set<string>
  pendingFamily: string | null
  onSelect: (family: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Add a Google Fonts family</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Pick a family to attach to the book. It is downloaded when extraction runs and
              embedded in the final bundle.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <GoogleFontPicker
          active={open}
          existingFamilies={existingFamilies}
          pendingFamily={pendingFamily}
          onSelect={onSelect}
        />
      </DialogContent>
    </Dialog>
  )
}
