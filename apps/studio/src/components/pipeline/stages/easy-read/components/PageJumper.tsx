import { useState, useEffect, useRef, useMemo } from "react"
import { ChevronDown, FileText, Search } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"

export interface PageJumperEntry {
  pageId: string
  pageNumber: number
  preview: string
}

export function PageJumper({
  pages,
  activePageId,
  onJump,
}: {
  pages: PageJumperEntry[]
  activePageId: string | null
  onJump: (pageId: string) => void
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const activePage = pages.find((p) => p.pageId === activePageId) ?? null

  const filtered = useMemo(() => {
    if (!query.trim()) return pages
    const q = query.toLowerCase().trim()
    return pages.filter(
      (item) =>
        String(item.pageNumber).includes(q) ||
        item.preview.toLowerCase().includes(q),
    )
  }, [pages, query])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Clear the filter only when the dropdown opens — not on every keystroke
  // (which would happen if `filtered` were a dependency here).
  useEffect(() => {
    if (open) setQuery("")
  }, [open])

  // Keep the keyboard highlight on the active page (or the first match while
  // filtering).
  useEffect(() => {
    if (!open) return
    const idx = filtered.findIndex((p) => p.pageId === activePageId)
    setHighlightIndex(Math.max(0, idx))
  }, [open, activePageId, filtered])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(filtered.length - 1, i + 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(0, i - 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const target = filtered[highlightIndex]
        if (target) {
          onJump(target.pageId)
          setOpen(false)
        }
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, filtered, highlightIndex, onJump])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${highlightIndex}"]`,
    )
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [open, highlightIndex])

  if (pages.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background pl-2.5 pr-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60"
      >
        <FileText className="h-3.5 w-3.5 text-fuchsia-500" />
        <span className="tabular-nums">
          {activePage ? t`Page ${String(activePage.pageNumber)}` : t`Jump to page`}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="relative border-b border-border/60 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t`Filter pages…`}
              autoFocus
              className="h-8 w-full rounded-md bg-muted/40 pl-8 pr-3 text-[12px] placeholder:text-muted-foreground/60 transition-colors focus:bg-background focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
            />
          </div>
          <div ref={listRef} className="max-h-[420px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                <Trans>No matching pages</Trans>
              </div>
            ) : (
              filtered.map((item, idx) => {
                const isActive = item.pageId === activePageId
                const isHighlighted = idx === highlightIndex
                return (
                  <button
                    key={item.pageId}
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => {
                      onJump(item.pageId)
                      setOpen(false)
                    }}
                    className={`relative flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors duration-150 ${
                      isActive
                        ? "bg-fuchsia-100/80 text-foreground ring-1 ring-inset ring-fuchsia-300"
                        : isHighlighted
                          ? "bg-fuchsia-50 text-foreground"
                          : "text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-1 rounded-r bg-fuchsia-500"
                      />
                    )}
                    <span
                      className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide ${
                        isActive ? "text-fuchsia-700" : "text-muted-foreground/60"
                      }`}
                    >
                      {t`Page ${String(item.pageNumber)}`}
                    </span>
                    <span className="line-clamp-2 flex-1 text-[12px] leading-snug">
                      {item.preview || t`No text`}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
