import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { msg, plural } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import {
  Search,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  ChevronDown,
  List,
  LayoutGrid,
  Plus,
  Pencil,
  Trash2,
  TriangleAlert,
  Check,
  ChevronLeft,
  ChevronRight,
  SearchX,
  HardDrive,
  FolderUp,
  ArrowRight,
} from "lucide-react"
import type { BookSummary } from "@/api/client"
import { BookCover } from "../BookCover"
import { toBookVM, type BookVM } from "../data"

type SortKey = "recent" | "newest" | "az"
const SORTS: { key: SortKey; label: MessageDescriptor }[] = [
  { key: "recent", label: msg`Recently edited` },
  { key: "newest", label: msg`Newest first` },
  { key: "az", label: msg`A–Z` },
]
const PAGE_SIZE = 8

export interface LibraryScreenProps {
  books: BookSummary[]
  locale: string
  onOpenAdd: () => void
  onDelete: (label: string) => void
}

export function LibraryScreen({ books, locale, onOpenAdd, onDelete }: LibraryScreenProps) {
  const navigate = useNavigate()
  const { t, i18n } = useLingui()
  const openBook = (label: string) => navigate({ to: "/books/$label/$step", params: { label, step: "book" } })

  const [view, setView] = useState<"list" | "grid">("grid")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("recent")
  const [active, setActive] = useState<string[]>([])
  const [draft, setDraft] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [stagePop, setStagePop] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [detailLabel, setDetailLabel] = useState<string | null>(null)
  const [detailStagesOpen, setDetailStagesOpen] = useState(false)

  const langs = useMemo(() => {
    const set = new Set<string>()
    for (const b of books) if (b.languageCode) set.add(b.languageCode.toUpperCase())
    return [...set].sort()
  }, [books])

  const vms = useMemo(() => books.map((b) => toBookVM(b, locale)), [books, locale])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = vms.filter((b) => {
      if (active.length > 0 && !active.includes(b.lang)) return false
      if (!q) return true
      return (b.displayTitle + " " + b.authors + " " + b.label).toLowerCase().includes(q)
    })
    if (sort === "az") list = [...list].sort((a, b) => a.displayTitle.localeCompare(b.displayTitle))
    else if (sort === "newest")
      list = [...list].sort((a, b) => new Date(b.raw.createdAt).getTime() - new Date(a.raw.createdAt).getTime())
    else list = [...list].sort((a, b) => new Date(b.raw.modifiedAt).getTime() - new Date(a.raw.modifiedAt).getTime())
    return list
  }, [vms, search, active, sort])

  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageSlice = shown.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const startIdx = shown.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const endIdx = Math.min(shown.length, safePage * PAGE_SIZE + PAGE_SIZE)

  const hasActive = active.length > 0
  const hasFilter = hasActive || search.trim().length > 0
  const countText = hasFilter
    ? t`${shown.length} of ${books.length} books`
    : plural(books.length, { one: "# book", other: "# books" })
  const activeSortLabel = SORTS.find((s) => s.key === sort)?.label

  const closeMenus = () => {
    setFiltersOpen(false)
    setSortOpen(false)
    setStagePop(null)
  }
  const anyMenu = filtersOpen || sortOpen || stagePop != null

  const detail = detailLabel ? vms.find((b) => b.label === detailLabel) ?? null : null

  function StagePill({ b, dark }: { b: BookVM; dark?: boolean }) {
    const furthest = b.discs.length ? b.discs[b.discs.length - 1].hex : "#c2c8d0"
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: dark ? 24 : 27,
          padding: "0 10px",
          background: dark ? "var(--card)" : "var(--muted)",
          border: "1px solid var(--border)",
          borderRadius: 999,
          font: "500 11.5px var(--font-sans)",
          color: "var(--foreground)",
          cursor: "pointer",
        }}
        onClick={(e) => {
          e.stopPropagation()
          setStagePop((p) => (p === b.label ? null : b.label))
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: furthest }} />
        <Plural value={b.stageCount} one="# stage" other="# stages" />
        <ChevronDown className="lucide" style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
      </span>
    )
  }

  function StagePopover({ b }: { b: BookVM }) {
    return (
      <div
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: 250,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-xl)",
          zIndex: 60,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "11px 13px 8px", font: "600 12.5px var(--font-sans)" }}>
          <Plural value={b.stageCount} one="# stage run" other="# stages run" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 5px", padding: "0 8px 10px" }}>
          {b.discs.map((d) => {
            const Icon = d.icon
            return (
              <div key={d.slug} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 6px", borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: 999, background: d.hex, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
                  <Icon className="lucide" style={{ width: 11, height: 11 }} />
                </span>
                <span style={{ font: "500 11.5px var(--font-sans)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {d.slug}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "24px 30px 40px", background: "var(--background)" }}>
      {anyMenu && <div onClick={closeMenus} style={{ position: "fixed", inset: 0, zIndex: 40 }} />}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ font: "700 24px/1 var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 6 }}><Trans>Library</Trans></div>
          <div style={{ font: "400 13px var(--font-sans)", color: "var(--muted-foreground)" }}>{countText}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 9,
            height: 40,
            padding: "0 14px",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--muted-foreground)",
          }}
        >
          <Search className="lucide" style={{ width: 14, height: 14 }} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder={t`Search by title, author, or label…`}
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "400 13.5px var(--font-sans)", color: "var(--foreground)" }}
          />
        </div>

        {langs.length > 0 && (
          <div style={{ position: "relative", flex: "none" }}>
            <button
              onClick={() => {
                setFiltersOpen((v) => !v)
                setSortOpen(false)
                setStagePop(null)
                setDraft([...active])
              }}
              className="btn btn-out"
              style={{
                height: 40,
                borderColor: filtersOpen || hasActive ? "var(--brand-400)" : "var(--border)",
                color: hasActive ? "var(--brand-700)" : "var(--foreground)",
              }}
            >
              <SlidersHorizontal className="lucide" style={{ width: 14, height: 14 }} />
              <Trans>Filters</Trans>
              {hasActive && (
                <span style={{ display: "grid", placeItems: "center", minWidth: 19, height: 19, padding: "0 5px", borderRadius: 999, background: "var(--brand-600)", color: "#fff", font: "600 11px var(--font-mono)" }}>
                  {active.length}
                </span>
              )}
            </button>
            {filtersOpen && (
              <div style={{ position: "absolute", top: 47, right: 0, width: 262, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-xl)", zIndex: 50, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", padding: "14px 14px 10px" }}>
                  <span style={{ font: "600 14px var(--font-sans)" }}><Trans>Filters</Trans></span>
                  <button onClick={closeMenus} style={{ marginLeft: "auto", background: "none", border: 0, color: "var(--muted-foreground)", cursor: "pointer", display: "grid", placeItems: "center", padding: 2 }}>
                    <X className="lucide" style={{ width: 14, height: 14 }} />
                  </button>
                </div>
                <div className="seclbl" style={{ padding: "0 15px 6px" }}><Trans>Language</Trans></div>
                <div style={{ padding: "0 6px 4px", maxHeight: 236, overflow: "auto" }}>
                  {langs.map((name) => {
                    const on = draft.includes(name)
                    return (
                      <div
                        key={name}
                        onClick={() => setDraft((d) => (d.includes(name) ? d.filter((x) => x !== name) : [...d, name]))}
                        style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}
                      >
                        <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${on ? "var(--brand-600)" : "var(--border)"}`, background: on ? "var(--brand-600)" : "var(--card)", display: "grid", placeItems: "center", flex: "none" }}>
                          <Check className="lucide" style={{ width: 12, height: 12, color: "#fff", opacity: on ? 1 : 0 }} />
                        </span>
                        <span style={{ font: "500 13px var(--font-sans)" }}>{name}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderTop: "1px solid var(--border)" }}>
                  <button onClick={() => setDraft([])} style={{ background: "none", border: 0, font: "500 12.5px var(--font-sans)", color: "var(--muted-foreground)", cursor: "pointer" }}>
                    <Trans>Reset all</Trans>
                  </button>
                  <button
                    onClick={() => {
                      setActive([...draft])
                      setFiltersOpen(false)
                      setPage(0)
                    }}
                    className="btn btn-pri btn-sm"
                  >
                    <Trans>Apply filters</Trans>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ position: "relative", flex: "none" }}>
          <button
            onClick={() => {
              setSortOpen((v) => !v)
              setFiltersOpen(false)
              setStagePop(null)
            }}
            className="btn btn-out"
            style={{ height: 40, borderColor: sortOpen ? "var(--brand-400)" : "var(--border)" }}
          >
            <ArrowUpDown className="lucide" style={{ width: 14, height: 14 }} />
            <span style={{ whiteSpace: "nowrap" }}>{activeSortLabel && i18n._(activeSortLabel)}</span>
            <ChevronDown className="lucide" style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} />
          </button>
          {sortOpen && (
            <div style={{ position: "absolute", top: 47, right: 0, width: 186, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-xl)", zIndex: 50, padding: 5 }}>
              {SORTS.map((s) => (
                <div
                  key={s.key}
                  onClick={() => {
                    setSort(s.key)
                    setSortOpen(false)
                    setPage(0)
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", font: "500 13px var(--font-sans)" }}
                >
                  <Check className="lucide" style={{ width: 14, height: 14, color: "var(--brand-600)", opacity: sort === s.key ? 1 : 0 }} />
                  {i18n._(s.label)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="seg" style={{ flex: "none" }}>
          <div className={`seg-i${view === "list" ? " on" : ""}`} onClick={() => setView("list")} title="List">
            <List className="lucide" style={{ width: 14, height: 14 }} />
          </div>
          <div className={`seg-i${view === "grid" ? " on" : ""}`} onClick={() => setView("grid")} title="Grid">
            <LayoutGrid className="lucide" style={{ width: 14, height: 14 }} />
          </div>
        </div>

        <button className="btn btn-pri btn-sm" style={{ flex: "none", height: 40 }} onClick={onOpenAdd}>
          <Plus className="lucide" style={{ width: 14, height: 14 }} />
          <Trans>Add book</Trans>
        </button>
      </div>

      {hasActive && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 18 }}>
          {active.map((name) => (
            <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 5px 0 12px", background: "var(--brand-50)", color: "var(--brand-700)", border: "1px solid var(--brand-200)", borderRadius: 999, font: "500 12.5px var(--font-sans)" }}>
              {name}
              <span
                onClick={() => {
                  setActive((a) => a.filter((x) => x !== name))
                  setDraft((d) => d.filter((x) => x !== name))
                  setPage(0)
                }}
                style={{ cursor: "pointer", display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 999, color: "var(--brand-600)" }}
              >
                <X className="lucide" style={{ width: 13, height: 13 }} />
              </span>
            </span>
          ))}
          <button onClick={() => { setActive([]); setDraft([]); setSearch(""); setPage(0) }} style={{ background: "none", border: 0, font: "500 12.5px var(--font-sans)", color: "var(--muted-foreground)", cursor: "pointer", padding: "0 6px" }}>
            <Trans>Clear all</Trans>
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, border: "2px dashed var(--border)", borderRadius: 14, background: "var(--muted)", padding: "56px 20px" }}>
          <div style={{ width: 46, height: 46, borderRadius: 999, background: "var(--card)", border: "1px solid var(--border)", display: "grid", placeItems: "center", color: "var(--muted-foreground)", marginBottom: 4 }}>
            <SearchX className="lucide" />
          </div>
          <div style={{ font: "600 14px var(--font-sans)", color: "var(--foreground)" }}><Trans>No books match these filters</Trans></div>
          <button onClick={() => { setActive([]); setDraft([]); setSearch(""); setPage(0) }} style={{ background: "none", border: 0, font: "500 12.5px var(--font-sans)", color: "var(--brand-700)", cursor: "pointer" }}>
            <Trans>Clear filters</Trans>
          </button>
        </div>
      ) : view === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pageSlice.map((b) => (
            <div key={b.label} className="brow" style={{ position: "relative", zIndex: stagePop === b.label ? 60 : "auto", overflow: stagePop === b.label ? "visible" : "hidden" }}>
              <div onClick={() => setDetailLabel(b.label)} className="covbox" style={{ width: 48, height: 64, margin: "13px 0 13px 15px", borderRadius: 6, cursor: "pointer" }}>
                <BookCover title={b.displayTitle} author={b.authors} cover={b.cover} />
              </div>
              <div className="brow-body" style={{ padding: "13px 18px", gap: 7 }}>
                <div className="brow-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="brow-ttl" onClick={() => setDetailLabel(b.label)} style={{ cursor: "pointer" }}>{b.displayTitle}</h3>
                    <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 2 }}>
                      {b.authors} · {b.pagesText} · {b.modified}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flex: "none" }}>
                    {b.needsRebuild && (
                      <span className="bdg bdg-dst">
                        <TriangleAlert className="lucide" />
                        <Trans>Needs rebuild</Trans>
                      </span>
                    )}
                    {b.isNew && <span className="bdg bdg-sec"><Trans>New</Trans></span>}
                    <span className="bdg bdg-out">{b.lang}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {b.hasStages ? (
                    <div style={{ position: "relative", marginLeft: "auto", flex: "none" }}>
                      <StagePill b={b} />
                      {stagePop === b.label && <StagePopover b={b} />}
                    </div>
                  ) : (
                    <span style={{ marginLeft: "auto", font: "400 12px var(--font-sans)", color: "var(--muted-foreground)" }}>
                      <Trans>Not started — add a PDF to begin</Trans>
                    </span>
                  )}
                </div>
              </div>
              <div className="brow-actions">
                <div className="brow-act" onClick={() => openBook(b.label)}>
                  <Pencil className="lucide" style={{ width: 14, height: 14 }} />
                </div>
                <div className="brow-act dang" onClick={() => onDelete(b.label)}>
                  <Trash2 className="lucide" style={{ width: 14, height: 14 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {pageSlice.map((b) => (
            <div key={b.label} className="gcard" onClick={() => setDetailLabel(b.label)}>
              <div style={{ position: "relative", height: 150, background: "var(--muted)", display: "grid", placeItems: "center", borderBottom: "1px solid var(--border)" }}>
                <span className="cov-langbadge">{b.lang}</span>
                {b.needsRebuild && (
                  <span className="bdg bdg-dst" style={{ position: "absolute", left: 8, top: 8, zIndex: 2, boxShadow: "var(--shadow-sm)" }}>
                    <TriangleAlert className="lucide" />
                    <Trans>Rebuild</Trans>
                  </span>
                )}
                <div className="covbox" style={{ width: 96, height: 128, borderRadius: 6, boxShadow: "var(--shadow-md)" }}>
                  <BookCover title={b.displayTitle} author={b.authors} cover={b.cover} />
                </div>
              </div>
              <div className="gcard-body" style={{ padding: "12px 13px 13px", gap: 6 }}>
                <h3 className="gcard-ttl" style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {b.displayTitle}
                </h3>
                <div style={{ font: "400 12px var(--font-sans)", color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {b.authors} · {b.pagesText}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 5 }}>
                  {b.hasStages && (
                    <span style={{ marginLeft: "auto", flex: "none", font: "500 11px var(--font-sans)", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                      <Plural value={b.stageCount} one="# stage" other="# stages" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
          <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--muted-foreground)" }}>
            <Trans>Showing {startIdx}–{endIdx} of {shown.length} books</Trans>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <button onClick={() => setPage(Math.max(0, safePage - 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", display: "grid", placeItems: "center", color: "var(--foreground)", cursor: "pointer", opacity: safePage === 0 ? 0.4 : 1 }}>
              <ChevronLeft className="lucide" style={{ width: 14, height: 14 }} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                style={{ minWidth: 32, height: 32, padding: "0 9px", borderRadius: 8, border: `1px solid ${i === safePage ? "var(--brand-600)" : "var(--border)"}`, background: i === safePage ? "var(--brand-600)" : "var(--card)", color: i === safePage ? "#fff" : "var(--foreground)", font: "600 12.5px var(--font-sans)", cursor: "pointer" }}
              >
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", display: "grid", placeItems: "center", color: "var(--foreground)", cursor: "pointer", opacity: safePage >= totalPages - 1 ? 0.4 : 1 }}>
              <ChevronRight className="lucide" style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      {detail && (
        <div
          onClick={() => {
            setDetailLabel(null)
            setDetailStagesOpen(false)
          }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.4)", zIndex: 100, display: "grid", placeItems: "center", padding: 28 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: "100%", maxHeight: "92vh", minHeight: 470, background: "var(--card)", borderRadius: 18, boxShadow: "var(--shadow-xl)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: 238, flex: "none", background: `linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.34)), ${detail.cover.bg}`, display: "grid", placeItems: "center", padding: 28 }}>
              <div className="covbox" style={{ width: 170, height: 227, borderRadius: 10, boxShadow: "0 22px 46px -14px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.16)" }}>
                <BookCover title={detail.displayTitle} author={detail.authors} cover={detail.cover} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, padding: "24px 26px", display: "flex", flexDirection: "column", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ font: "700 19px/1.2 var(--font-sans)", letterSpacing: "-0.01em", margin: 0 }}>{detail.displayTitle}</h2>
                  <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 5 }}>
                    <Trans>{detail.authors} · {detail.pagesText} · edited {detail.modified}</Trans>
                  </div>
                </div>
                <button onClick={() => { setDetailLabel(null); setDetailStagesOpen(false) }} style={{ flex: "none", background: "none", border: 0, color: "var(--muted-foreground)", cursor: "pointer", display: "grid", placeItems: "center", padding: 3 }}>
                  <X className="lucide" />
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 12 }}>
                {detail.needsRebuild && (
                  <span className="bdg bdg-dst">
                    <TriangleAlert className="lucide" />
                    <Trans>Needs rebuild</Trans>
                  </span>
                )}
                <span className="bdg bdg-out">{detail.lang}</span>
                {detail.hasStages && (
                  <div style={{ position: "relative", flex: "none" }}>
                    <span
                      onClick={() => setDetailStagesOpen((v) => !v)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 999, font: "500 11px var(--font-sans)", color: "var(--foreground)", cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: detail.discs[detail.discs.length - 1]?.hex ?? "#c2c8d0" }} />
                      <Plural value={detail.stageCount} one="# stage" other="# stages" />
                      <ChevronDown className="lucide" style={{ width: 12, height: 12, color: "var(--muted-foreground)" }} />
                    </span>
                    {detailStagesOpen && (
                      <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: 250, background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-xl)", zIndex: 70, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 5px", padding: "10px 8px" }}>
                          {detail.discs.map((d) => {
                            const Icon = d.icon
                            return (
                              <div key={d.slug} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 6px", borderRadius: 6 }}>
                                <span style={{ width: 18, height: 18, borderRadius: 999, background: d.hex, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
                                  <Icon className="lucide" style={{ width: 11, height: 11 }} />
                                </span>
                                <span style={{ font: "500 11.5px var(--font-sans)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.slug}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, marginTop: 16, border: "1px solid var(--border)", background: "var(--muted)", borderRadius: 12, padding: "11px 13px" }}>
                <span className="bdg bdg-sec">
                  <HardDrive className="lucide" />
                  <Trans>Local only</Trans>
                </span>
                <span style={{ font: "400 12px var(--font-sans)", color: "var(--muted-foreground)" }}>
                  <Trans>Stored on this computer — share it by exporting a .zip</Trans>
                </span>
                <button className="btn btn-out btn-sm" style={{ marginLeft: "auto", flex: "none" }}>
                  <FolderUp className="lucide" style={{ width: 14, height: 14 }} />
                  <Trans>Export .zip</Trans>
                </button>
              </div>

              <div style={{ display: "flex", gap: 9, marginTop: "auto", paddingTop: 22 }}>
                <button className="btn btn-pri btn-sm" onClick={() => openBook(detail.label)}>
                  <Trans>Continue editing</Trans>
                  <ArrowRight className="lucide" style={{ width: 14, height: 14 }} />
                </button>
                <button className="btn btn-out btn-sm"><Trans>Preview</Trans></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
