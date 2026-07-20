import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Search, House, BookMarked, Split, Settings, Plus, Upload, CornerDownLeft, BookOpen, type LucideIcon } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { BookSummary } from "@/api/client"
import { toBookVM } from "./data"
import { Kbd } from "./ui/Kbd"
import type { RedesignView } from "./types"

interface PaletteItem {
  id: string
  title: string
  sub?: string
  icon?: LucideIcon
  coverBg?: string
  run: () => void
}
interface PaletteGroup {
  label: string
  items: PaletteItem[]
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  books: BookSummary[]
  locale: string
  onNavigate: (view: RedesignView) => void
  onOpenAdd: () => void
}

export function CommandPalette({ open, onClose, books, locale, onNavigate, onOpenAdd }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { t } = useLingui()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const groups = useMemo<PaletteGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const nav: PaletteItem[] = [
      { id: "nav-home", title: t`Home`, icon: House, run: () => onNavigate("home") },
      { id: "nav-library", title: t`Library`, icon: BookMarked, run: () => onNavigate("library") },
      { id: "nav-handoffs", title: t`Split & merge`, icon: Split, run: () => onNavigate("handoffs") },
      { id: "nav-settings", title: t`Settings`, icon: Settings, run: () => onNavigate("settings") },
    ]
    const actions: PaletteItem[] = [
      { id: "act-add", title: t`Add a book`, sub: t`Convert a PDF or import a project`, icon: Plus, run: onOpenAdd },
      { id: "act-import", title: t`Import a project`, sub: t`.zip → added as-is`, icon: Upload, run: () => navigate({ to: "/books/import" }) },
    ]
    const bookItems: PaletteItem[] = books.map((b) => {
      const vm = toBookVM(b, locale)
      return {
        id: `book-${b.label}`,
        title: vm.displayTitle,
        sub: `${vm.authors} · ${vm.pagesText}`,
        coverBg: vm.cover.bg,
        run: () => navigate({ to: "/books/$label/$step", params: { label: b.label, step: "book" } }),
      }
    })
    const match = (it: PaletteItem) => !q || (it.title + " " + (it.sub ?? "")).toLowerCase().includes(q)
    return [
      { label: t`Navigation`, items: nav.filter(match) },
      { label: t`Books`, items: bookItems.filter(match) },
      { label: t`Actions`, items: actions.filter(match) },
    ].filter((g) => g.items.length > 0)
  }, [query, books, locale, onNavigate, onOpenAdd, navigate, t])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => {
    if (active >= flat.length) setActive(flat.length > 0 ? flat.length - 1 : 0)
  }, [flat.length, active])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActive((i) => Math.min(flat.length - 1, i + 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const item = flat[active]
        if (item) {
          item.run()
          onClose()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, flat, active, onClose])

  let runningIndex = -1

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12%] block max-w-[600px] translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden"
      >
        <DialogTitle className="sr-only">
          <Trans>Command palette</Trans>
        </DialogTitle>

        <div className="flex items-center gap-3 border-b px-4 py-3.5">
          <Search className="size-[18px] text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder={t`Search books, actions and settings…`}
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <Kbd keys={[t`Esc`]} />
        </div>

        <div className="max-h-[46vh] overflow-auto p-2">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-3 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {g.label}
              </div>
              {g.items.map((it) => {
                runningIndex += 1
                const idx = runningIndex
                const isActive = idx === active
                const Icon = it.icon
                return (
                  <div
                    key={it.id}
                    onClick={() => {
                      it.run()
                      onClose()
                    }}
                    onMouseEnter={() => setActive(idx)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5",
                      isActive && "bg-muted",
                    )}
                  >
                    {it.coverBg ? (
                      <span className="h-8 w-6 shrink-0 rounded-sm shadow-sm" style={{ background: it.coverBg }} />
                    ) : (
                      <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-brand-50 text-brand-600">
                        {Icon ? <Icon className="size-4" /> : <BookOpen className="size-4" />}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium text-foreground">{it.title}</div>
                      {it.sub && <div className="truncate text-xs text-muted-foreground">{it.sub}</div>}
                    </div>
                    {isActive && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                  </div>
                )
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <div className="px-5 py-9 text-center text-[13px] text-muted-foreground">
              <Trans>No results for “{query}”</Trans>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 border-t bg-muted px-4 py-2.5 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Kbd keys={["↑", "↓"]} />
            <Trans>navigate</Trans>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd keys={["↵"]} />
            <Trans>open</Trans>
          </span>
          <span className="ml-auto font-mono text-[11px]">
            <Trans>⌘K to toggle</Trans>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
