import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { Search, ChevronDown, Check, ArrowDownUp, Layers, SearchX, Plus, TriangleAlert, MessageSquare } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ActionMenu } from "@/components/ui/action-menu"
import { BookCover } from "../../BookCover"
import type { BookVM } from "../../data"
import { StageBar, ShelfCard, ViewToggle, type ViewMode } from "../home/home-full/kit"

export interface LibBook extends BookVM {
  hasError?: boolean
  pendingComments?: number
}

type SortKey = "recent" | "title" | "progress" | "pages" | "created"
type Group = "none" | "attention"
type Attention = "errors" | "feedback" | "none"

const ATTENTION_ORDER: Attention[] = ["errors", "feedback", "none"]

function attentionOf(b: LibBook): Attention {
  if (b.needsRebuild || b.hasError) return "errors"
  if ((b.pendingComments ?? 0) > 0) return "feedback"
  return "none"
}

const time = (iso: string) => new Date(iso).getTime()

function sortBooks(list: LibBook[], key: SortKey): LibBook[] {
  const arr = [...list]
  switch (key) {
    case "title":
      return arr.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle))
    case "pages":
      return arr.sort((a, b) => b.raw.pageCount - a.raw.pageCount)
    case "progress":
      return arr.sort((a, b) => b.discs.length - a.discs.length)
    case "created":
      return arr.sort((a, b) => time(b.raw.createdAt) - time(a.raw.createdAt))
    default:
      return arr.sort((a, b) => time(b.raw.modifiedAt) - time(a.raw.modifiedAt))
  }
}

export interface LibraryViewProps {
  books: LibBook[]
  onOpen: (label: string) => void
  onAddBook: () => void
  initialGroup?: Group
}

export function LibraryView({ books, onOpen, onAddBook, initialGroup = "attention" }: LibraryViewProps) {
  const { t } = useLingui()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("recent")
  const [group, setGroup] = useState<Group>(initialGroup)
  const [view, setView] = useState<ViewMode>("grid")

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 180)
    return () => clearTimeout(id)
  }, [search])

  const q = debouncedSearch.trim().toLowerCase()
  const results = useMemo(() => {
    const list = q ? books.filter((b) => `${b.displayTitle} ${b.authors} ${b.label}`.toLowerCase().includes(q)) : books
    return sortBooks(list, sort)
  }, [books, q, sort])

  const grouped = useMemo(() => {
    if (group !== "attention") return null
    return ATTENTION_ORDER.map((a) => ({ attention: a, items: results.filter((b) => attentionOf(b) === a) })).filter(
      (g) => g.items.length > 0,
    )
  }, [results, group])

  const SORTS: { key: SortKey; label: ReactNode }[] = [
    { key: "recent", label: <Trans>Recently edited</Trans> },
    { key: "title", label: <Trans>Title (A–Z)</Trans> },
    { key: "progress", label: <Trans>Progress</Trans> },
    { key: "pages", label: <Trans>Pages</Trans> },
    { key: "created", label: <Trans>Date created</Trans> },
  ]
  const menuBtn =
    "inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-[13px] font-medium text-foreground transition-[transform,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-brand-300 active:scale-[0.97]"

  return (
    <div className="flex h-full flex-col px-8 pt-1">
      <div className="flex items-center justify-between gap-4 pb-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">
            <Trans>Library</Trans>
          </h1>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            {results.length === books.length ? (
              <Plural value={books.length} one="# book" other="# books" />
            ) : (
              <Trans>
                {results.length} of {books.length} books
              </Trans>
            )}
          </div>
        </div>
        <Button onClick={onAddBook} className="bg-brand-600 text-white transition-transform hover:bg-brand-700 active:scale-[0.97]">
          <Plus className="size-4" />
          <Trans>Add book</Trans>
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b pb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prependIcon={<Search className="size-4" />}
          placeholder={t`Search by title or author…`}
          wrapperClassName="w-full max-w-[340px]"
        />
        <div className="ml-auto flex items-center gap-2">
          <ActionMenu
            triggerClassName={menuBtn}
            align="right"
            trigger={
              <>
                <ArrowDownUp className="size-3.5 text-muted-foreground" />
                {SORTS.find((s) => s.key === sort)?.label}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </>
            }
            items={SORTS.map((s) => ({
              icon: sort === s.key ? Check : undefined,
              label: s.label,
              onClick: () => setSort(s.key),
            }))}
          />
          <button
            type="button"
            onClick={() => setGroup((g) => (g === "attention" ? "none" : "attention"))}
            aria-pressed={group === "attention"}
            title={t`Group by attention`}
            className={cn(menuBtn, group === "attention" && "border-brand-500 bg-brand-50 text-brand-700")}
          >
            <Layers className="size-3.5" />
            <Trans>Group</Trans>
          </button>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-auto py-5", results.length === 0 && "grid place-items-center")}>
        <div key={view} className="w-full animate-content-in">
          {results.length === 0 ? (
            <NoResults onClear={() => setSearch("")} />
          ) : view === "grid" ? (
            <GridBody grouped={grouped} results={results} onOpen={onOpen} />
          ) : (
            <TableBody grouped={grouped} results={results} onOpen={onOpen} />
          )}
        </div>
      </div>
    </div>
  )
}

function AttentionName({ attention }: { attention: Attention }) {
  if (attention === "errors") return <Trans>Pending errors</Trans>
  if (attention === "feedback") return <Trans>Pending feedback</Trans>
  return <Trans>No pending items</Trans>
}

function AttentionBadge({ book }: { book: LibBook }) {
  const a = attentionOf(book)
  if (a === "errors")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-stage-toc px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm">
        <TriangleAlert className="size-3" />
        <Trans>Needs fixing</Trans>
      </span>
    )
  if (a === "feedback")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm">
        <MessageSquare className="size-3" />
        <Plural value={book.pendingComments ?? 0} one="# comment" other="# comments" />
      </span>
    )
  return null
}

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-x-5 gap-y-7"

function AttentionHeading({ attention, count }: { attention: Attention; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={cn("text-[12px] font-semibold uppercase tracking-[0.06em]", attention === "none" ? "text-muted-foreground" : "text-foreground")}>
        <AttentionName attention={attention} />
      </span>
      <span className="text-[12px] tabular-nums text-muted-foreground">{count}</span>
    </div>
  )
}

function GridCards({ items, onOpen }: { items: LibBook[]; onOpen: (label: string) => void }) {
  return (
    <div className={GRID}>
      {items.map((vm) => (
        <ShelfCard
          key={vm.label}
          vm={vm}
          onOpen={onOpen}
          progress
          badge={attentionOf(vm) !== "none" ? <AttentionBadge book={vm} /> : undefined}
        />
      ))}
    </div>
  )
}

function GridBody({
  grouped,
  results,
  onOpen,
}: {
  grouped: { attention: Attention; items: LibBook[] }[] | null
  results: LibBook[]
  onOpen: (label: string) => void
}) {
  if (grouped) {
    return (
      <div className="flex flex-col gap-8">
        {grouped.map((g) => (
          <section key={g.attention}>
            <AttentionHeading attention={g.attention} count={g.items.length} />
            <GridCards items={g.items} onOpen={onOpen} />
          </section>
        ))}
      </div>
    )
  }
  return <GridCards items={results} onOpen={onOpen} />
}

const CELL = "px-4 py-3 align-middle"

function TableBody({
  grouped,
  results,
  onOpen,
}: {
  grouped: { attention: Attention; items: LibBook[] }[] | null
  results: LibBook[]
  onOpen: (label: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="sticky top-0 z-10 border-b bg-muted/60 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground backdrop-blur">
            <th className={CELL}>
              <Trans>Book</Trans>
            </th>
            <th className={cn(CELL, "w-[24%]")}>
              <Trans>Progress</Trans>
            </th>
            <th className={CELL}>
              <Trans>Pages</Trans>
            </th>
            <th className={CELL}>
              <Trans>Lang</Trans>
            </th>
            <th className={CELL}>
              <Trans>Last edited</Trans>
            </th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {grouped
            ? grouped.map((g) => <TableGroup key={g.attention} attention={g.attention} items={g.items} onOpen={onOpen} />)
            : results.map((vm) => <Row key={vm.label} vm={vm} onOpen={onOpen} />)}
        </tbody>
      </table>
    </div>
  )
}

function TableGroup({ attention, items, onOpen }: { attention: Attention; items: LibBook[]; onOpen: (label: string) => void }) {
  return (
    <>
      <tr>
        <td colSpan={5} className="border-b bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span className={cn("mr-2", attention === "none" ? "text-muted-foreground" : "text-foreground")}>
            <AttentionName attention={attention} />
          </span>
          {items.length}
        </td>
      </tr>
      {items.map((vm) => (
        <Row key={vm.label} vm={vm} onOpen={onOpen} />
      ))}
    </>
  )
}

function Row({ vm, onOpen }: { vm: LibBook; onOpen: (label: string) => void }) {
  return (
    <tr
      onClick={() => onOpen(vm.label)}
      className="group cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
    >
      <td className={CELL}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(vm.label)
          }}
          className="flex w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <div className="h-14 w-[42px] shrink-0 overflow-hidden rounded-md shadow-sm ring-1 ring-black/5">
            <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} fit="cover" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{vm.displayTitle}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">{vm.authors}</div>
          </div>
        </button>
      </td>
      <td className={CELL}>
        <StageBar vm={vm} className="min-w-[120px]" />
      </td>
      <td className={cn(CELL, "tabular-nums text-muted-foreground")}>{vm.pagesText}</td>
      <td className={cn(CELL, "font-mono text-[11.5px] text-muted-foreground")}>{vm.lang}</td>
      <td className={cn(CELL, "whitespace-nowrap text-muted-foreground")}>{vm.modified}</td>
    </tr>
  )
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-6" />
      </div>
      <div className="mt-4 text-[15px] font-semibold">
        <Trans>No books match your search</Trans>
      </div>
      <p className="mt-1 max-w-[38ch] text-[13px] text-muted-foreground">
        <Trans>Try a different title or author.</Trans>
      </p>
      <Button variant="outline" size="sm" onClick={onClear} className="mt-4">
        <Trans>Clear search</Trans>
      </Button>
    </div>
  )
}
