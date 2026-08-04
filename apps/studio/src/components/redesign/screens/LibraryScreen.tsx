import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg, plural } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Search, SlidersHorizontal, X, ArrowUpDown, List, LayoutGrid, Plus, SearchX, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"
import { toBookVM } from "../data"
import { Pager } from "../ui/Pager"
import { ScreenFallback } from "../ui/ScreenFallback"
import { useRedesignBooks } from "../use-redesign-books"
import { useRedesignShell } from "../RedesignShellContext"
import { BookRow } from "./library/BookRow"
import { BookGridCard } from "./library/BookGridCard"
import { BookDetailDialog } from "./library/BookDetailDialog"
import { LibraryEmptyState } from "./library/LibraryEmptyState"

type SortKey = "recent" | "newest" | "az"
const SORTS: { key: SortKey; label: MessageDescriptor }[] = [
  { key: "recent", label: msg`Recently edited` },
  { key: "newest", label: msg`Newest first` },
  { key: "az", label: msg`A–Z` },
]
const PAGE_SIZE = 8

export function LibraryScreen() {
  const navigate = useNavigate()
  const { t, i18n } = useLingui()
  const { books, locale, isLoading, error } = useRedesignBooks()
  const { openAdd, requestDelete } = useRedesignShell()
  const openBook = (label: string) => navigate({ to: "/books/$label/$step", params: { label, step: "book" } })

  const [view, setView] = useState<"list" | "grid">("grid")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("recent")
  const [active, setActive] = useState<string[]>([])
  const [draft, setDraft] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [detailLabel, setDetailLabel] = useState<string | null>(null)

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

  const hasActive = active.length > 0
  const hasFilter = hasActive || search.trim().length > 0
  const countText = hasFilter
    ? t`${shown.length} of ${books.length} books`
    : plural(books.length, { one: "# book", other: "# books" })

  const clearAll = () => {
    setActive([])
    setDraft([])
    setSearch("")
    setPage(0)
  }

  const detail = detailLabel ? vms.find((b) => b.label === detailLabel) ?? null : null

  if (isLoading || error) return <ScreenFallback error={error} />

  if (books.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background px-[30px] pb-10 pt-6">
        <div className="shrink-0">
          <div className="mb-1.5 text-2xl font-bold leading-none tracking-[-0.02em]">
            <Trans>Library</Trans>
          </div>
          <div className="text-[13px] text-muted-foreground">{countText}</div>
        </div>
        <LibraryEmptyState onOpenAdd={openAdd} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-background px-[30px] pb-10 pt-6">
      <div className="mb-4">
        <div className="mb-1.5 text-2xl font-bold leading-none tracking-[-0.02em]">
          <Trans>Library</Trans>
        </div>
        <div className="text-[13px] text-muted-foreground">{countText}</div>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <Input
          wrapperClassName="flex-1"
          className="h-10"
          prependIcon={<Search className="size-3.5" />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          placeholder={t`Search by title, author, or label…`}
        />

        {langs.length > 0 && (
          <Popover
            open={filtersOpen}
            onOpenChange={(o) => {
              setFiltersOpen(o)
              if (o) setDraft([...active])
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("h-10", hasActive && "border-brand-400 text-brand-700")}>
                <SlidersHorizontal className="size-3.5" />
                <Trans>Filters</Trans>
                {hasActive && (
                  <span className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-primary px-1.5 font-mono text-[11px] font-semibold text-primary-foreground">
                    {active.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[262px] p-0">
              <div className="flex items-center px-3.5 pb-2.5 pt-3.5">
                <span className="text-sm font-semibold">
                  <Trans>Filters</Trans>
                </span>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label={t`Close filters`}
                  className="ml-auto grid place-items-center p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="px-3.5 pb-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <Trans>Language</Trans>
              </div>
              <div className="max-h-[236px] overflow-auto px-1.5 pb-1">
                {langs.map((name) => {
                  const on = draft.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setDraft((d) => (d.includes(name) ? d.filter((x) => x !== name) : [...d, name]))}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
                    >
                      <span className={cn("grid size-[17px] shrink-0 place-items-center rounded border-[1.5px]", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="text-[13px] font-medium">{name}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between border-t px-3.5 py-2.5">
                <button type="button" onClick={() => setDraft([])} className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
                  <Trans>Reset all</Trans>
                </button>
                <Button
                  size="sm"
                  onClick={() => {
                    setActive([...draft])
                    setFiltersOpen(false)
                    setPage(0)
                  }}
                >
                  <Trans>Apply filters</Trans>
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v as SortKey)
            setPage(0)
          }}
        >
          <SelectTrigger className="h-10 w-[178px] gap-1.5">
            <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {SORTS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {i18n._(s.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SegmentedControl
          className="h-10 w-20 shrink-0"
          value={view}
          onValueChange={setView}
          options={[
            { value: "list", label: "", icon: <List className="size-3.5" /> },
            { value: "grid", label: "", icon: <LayoutGrid className="size-3.5" /> },
          ]}
        />

        <Button className="h-10 shrink-0" onClick={openAdd}>
          <Plus className="size-3.5" />
          <Trans>Add book</Trans>
        </Button>
      </div>

      {hasActive && (
        <div className="mb-[18px] flex flex-wrap items-center gap-2">
          {active.map((name) => (
            <Badge key={name} variant="info" className="h-[30px] gap-1.5 rounded-full py-0 pl-3 pr-1 text-[12.5px] font-medium">
              {name}
              <button
                type="button"
                onClick={() => {
                  setActive((a) => a.filter((x) => x !== name))
                  setDraft((d) => d.filter((x) => x !== name))
                  setPage(0)
                }}
                aria-label={t`Remove ${name} filter`}
                className="grid size-[19px] place-items-center rounded-full text-brand-600 hover:bg-brand-100"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <button type="button" onClick={clearAll} className="px-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
            <Trans>Clear all</Trans>
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed bg-muted px-5 py-14">
          <div className="mb-1 grid size-[46px] place-items-center rounded-full border bg-card text-muted-foreground">
            <SearchX className="size-5" />
          </div>
          <div className="text-sm font-semibold">
            <Trans>No books match these filters</Trans>
          </div>
          <button type="button" onClick={clearAll} className="text-[12.5px] font-medium text-brand-700 hover:underline">
            <Trans>Clear filters</Trans>
          </button>
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col gap-2.5">
          {pageSlice.map((b) => (
            <BookRow
              key={b.label}
              book={b}
              onOpenDetail={() => setDetailLabel(b.label)}
              onEdit={() => openBook(b.label)}
              onDelete={() => requestDelete(b.label)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {pageSlice.map((b) => (
            <BookGridCard key={b.label} book={b} onOpenDetail={() => setDetailLabel(b.label)} />
          ))}
        </div>
      )}

      <Pager
        page={safePage}
        totalPages={totalPages}
        totalItems={shown.length}
        pageSize={PAGE_SIZE}
        onChange={setPage}
        className="mt-5"
      />

      <BookDetailDialog book={detail} onOpenChange={(o) => !o && setDetailLabel(null)} onEdit={openBook} />
    </div>
  )
}
