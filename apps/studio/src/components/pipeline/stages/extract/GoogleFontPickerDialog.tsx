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
import { cn } from "@/lib/utils"
import { useGoogleFontsCatalog } from "@/hooks/use-book-fonts"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"

const COLS = 4
const CARD_H = 140
const ROW_GAP = 12
const ROW_H = CARD_H + ROW_GAP

function previewCss2Url(family: string): string {
  const f = family.trim().replace(/\s+/g, "+")
  return `https://fonts.googleapis.com/css2?family=${f}&text=${encodeURIComponent(family)}&display=swap`
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
  const { t } = useLingui()
  const { data, isLoading, isError } = useGoogleFontsCatalog(open)
  const [query, setQuery] = useState("")
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const requestedRef = useRef<Set<string>>(new Set())
  const [requested, setRequested] = useState<string[]>([])

  const families = useMemo(() => data?.families ?? [], [data])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return families
    return families.filter((f) => f.family.toLowerCase().includes(q))
  }, [families, query])

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
  }, [query, rowVirtualizer])

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

        {requested.map((family) => (
          <link key={family} rel="stylesheet" href={previewCss2Url(family)} />
        ))}

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
      </DialogContent>
    </Dialog>
  )
}
