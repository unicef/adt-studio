import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Search, House, BookMarked, Split, Settings, Plus, Upload, CornerDownLeft, BookOpen } from "lucide-react"
import type { BookSummary } from "@/api/client"
import { toBookVM } from "./data"
import type { RedesignView } from "./types"

interface PaletteItem {
  id: string
  title: string
  sub?: string
  icon?: typeof House
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
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "ArrowDown") {
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

  if (!open) return null

  let runningIndex = -1

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.42)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 94 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 600, maxWidth: "92vw", maxHeight: "66vh", display: "flex", flexDirection: "column", background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-xl)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 18px", borderBottom: "1px solid var(--border)" }}>
          <Search className="lucide" style={{ width: 18, height: 18, color: "var(--muted-foreground)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder={t`Search books, actions and settings…`}
            style={{ flex: 1, border: 0, outline: 0, background: "transparent", font: "400 15px var(--font-sans)", color: "var(--foreground)" }}
          />
          <span className="kbd">
            <b><Trans>Esc</Trans></b>
          </span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {groups.map((g) => (
            <div key={g.label}>
              <div style={{ font: "600 11px var(--font-sans)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)", padding: "10px 12px 5px" }}>
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
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 10, cursor: "pointer", background: isActive ? "var(--muted)" : "transparent" }}
                  >
                    {it.coverBg ? (
                      <span style={{ width: 24, height: 32, borderRadius: 4, flex: "none", background: it.coverBg, boxShadow: "var(--shadow-sm)" }} />
                    ) : (
                      <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", background: "var(--brand-50)", color: "var(--brand-600)", display: "grid", placeItems: "center" }}>
                        {Icon ? <Icon className="lucide" style={{ width: 16, height: 16 }} /> : <BookOpen className="lucide" style={{ width: 16, height: 16 }} />}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "500 13.5px var(--font-sans)", color: "var(--foreground)" }}>{it.title}</div>
                      {it.sub && (
                        <div style={{ font: "400 12px var(--font-sans)", color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {it.sub}
                        </div>
                      )}
                    </div>
                    {isActive && <CornerDownLeft className="lucide" style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} />}
                  </div>
                )
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <div style={{ textAlign: "center", padding: "34px 20px", color: "var(--muted-foreground)", font: "400 13px var(--font-sans)" }}>
              <Trans>No results for &quot;{query}&quot;</Trans>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 16px", borderTop: "1px solid var(--border)", background: "var(--muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 11.5px var(--font-sans)", color: "var(--muted-foreground)" }}>
            <span className="kbd">
              <b>↑</b>
              <b>↓</b>
            </span>
            <Trans>navigate</Trans>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 11.5px var(--font-sans)", color: "var(--muted-foreground)" }}>
            <span className="kbd">
              <b>↵</b>
            </span>
            <Trans>open</Trans>
          </span>
          <span style={{ marginLeft: "auto", font: "600 11px var(--font-mono)", color: "var(--muted-foreground)" }}><Trans>⌘K to toggle</Trans></span>
        </div>
      </div>
    </div>
  )
}
