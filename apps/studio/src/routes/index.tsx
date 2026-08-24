import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { hasCompletedOnboarding } from "@/hooks/use-onboarding"
import {
  Plus,
  ArrowRight,
  BookOpen,
  Trash2,
  FileText,
  Building2,
  User,
  Globe,
  Pencil,
  Upload,
  Search,
  CalendarPlus,
  Clock,
  Scissors,
  Puzzle,
} from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StudioTopBar } from "@/components/StudioTopBar"
import { usePageTitle } from "@/hooks/use-page-title"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DeleteBookDialog } from "@/components/books/DeleteBookDialog"
import { useBooks, useDeleteBook } from "@/hooks/use-books"
import {
  getPipelineStages,
  type PipelineStageDefinition,
} from "@/components/pipeline/stage-config"
import {
  getStageLabelI18n,
  getStageDescriptionI18n,
} from "@/components/pipeline/pipeline-i18n"
import type { BookSummary } from "@/api/client"
import { getBookCoverUrl } from "@/api/client"
import { cn, isElectron } from "@/lib/utils"

type BookSortKey = "modified" | "created" | "alphabetical"

const BOOK_SORT_STORAGE_KEY = "adt.books.sort"
const VALID_SORT_KEYS: readonly BookSortKey[] = [
  "modified",
  "created",
  "alphabetical",
]

function readStoredSort(): BookSortKey {
  if (typeof window === "undefined") return "modified"
  const stored = window.localStorage.getItem(BOOK_SORT_STORAGE_KEY)
  return VALID_SORT_KEYS.includes(stored as BookSortKey)
    ? (stored as BookSortKey)
    : "modified"
}

function sortBooks(books: BookSummary[], key: BookSortKey): BookSummary[] {
  const copy = [...books]
  switch (key) {
    case "modified":
      return copy.sort(
        (a, b) =>
          new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
      )
    case "created":
      return copy.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    case "alphabetical":
      return copy.sort((a, b) =>
        (a.title ?? a.label).localeCompare(b.title ?? b.label, undefined, {
          sensitivity: "base",
        }),
      )
  }
}

function useFlipList<T>(
  items: T[],
  keyFn: (item: T) => string,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null)
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map())
  const keys = items.map(keyFn).join("|")

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const children = Array.from(
      container.querySelectorAll<HTMLElement>("[data-flip-key]"),
    )
    const newRects = new Map<string, DOMRect>()
    for (const el of children) {
      const key = el.dataset.flipKey
      if (!key) continue
      newRects.set(key, el.getBoundingClientRect())
    }

    for (const el of children) {
      const key = el.dataset.flipKey
      if (!key) continue
      const oldRect = prevRectsRef.current.get(key)
      const newRect = newRects.get(key)
      if (!oldRect || !newRect) continue
      const dx = oldRect.left - newRect.left
      const dy = oldRect.top - newRect.top
      if (dx === 0 && dy === 0) continue
      el.style.transition = "transform 0s"
      el.style.transform = `translate(${dx}px, ${dy}px)`
      requestAnimationFrame(() => {
        el.style.transition = "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)"
        el.style.transform = ""
        const onEnd = (event: TransitionEvent) => {
          if (event.propertyName !== "transform") return
          el.style.transition = ""
          el.removeEventListener("transitionend", onEnd)
        }
        el.addEventListener("transitionend", onEnd)
      })
    }

    prevRectsRef.current = newRects
  }, [keys])

  return containerRef
}

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (
      typeof window !== "undefined" &&
      isElectron() &&
      !hasCompletedOnboarding()
    ) {
      throw redirect({ to: "/onboarding" })
    }
  },
  component: HomePage,
})

/** Pipeline stages shown in the sidebar (skip the "book" overview entry) */
const PIPELINE_STEPS = getPipelineStages()

function CompletedStageBadges({
  completedSet,
  pipelineStages,
}: {
  completedSet: Set<string>
  pipelineStages: readonly PipelineStageDefinition[]
}) {
  const visibleStages = pipelineStages.filter((s) => completedSet.has(s.slug))
  if (visibleStages.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {visibleStages.map((stage) => {
        const Icon = stage.icon
        return (
          <span
            key={stage.slug}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${stage.bgLight} ${stage.textColor} ${stage.borderColor}`}
          >
            <Icon className="h-3 w-3" />
            {getStageLabelI18n(stage.slug)}
          </span>
        )
      })}
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

function BookRow({
  book,
  onDelete,
  pipelineStages,
}: {
  book: BookSummary
  onDelete: (label: string) => void
  pipelineStages: readonly PipelineStageDefinition[]
}) {
  const { t, i18n } = useLingui()
  const hasMetadata = book.title || book.authors.length > 0
  const completedSet = useMemo(
    () => new Set(book.completedStages),
    [book.completedStages],
  )
  const [coverFailed, setCoverFailed] = useState(false)
  // Show the cover when there are extracted pages OR a source PDF — the server
  // falls back to rendering page 1 from the PDF for un-extracted books (e.g. a
  // freshly-split shell). onError still drops to the placeholder if neither works.
  const showCover = (book.pageCount > 0 || book.hasSourcePdf) && !coverFailed
  const coverUrl = useMemo(
    () => getBookCoverUrl(book.label, book.modifiedAt),
    [book.label, book.modifiedAt],
  )
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        dateStyle: "medium",
      }),
    [i18n.locale],
  )
  const createdLabel = dateFormatter.format(new Date(book.createdAt))
  const modifiedLabel = dateFormatter.format(new Date(book.modifiedAt))
  return (
    <div className="group rounded-xl border bg-card transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5">
      <div className="flex items-stretch">
        {/* Main content — clickable */}
        <Link
          to="/books/$label/$step"
          params={{ label: book.label, step: "book" }}
          className="flex flex-1 min-w-0 gap-4 p-5"
        >
          {/* Cover thumbnail */}
          <div className="flex h-24 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {showCover ? (
              (() => {
                const title = book.title ?? book.label
                return (
                  <img
                    src={coverUrl}
                    alt={t`Cover of ${title}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => setCoverFailed(true)}
                  />
                )
              })()
            ) : (
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
          {/* Top: title + badges */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <h2 className="font-semibold text-base truncate">
                {book.title ?? book.label}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {book.part && (
                <Badge
                  variant="outline"
                  className="gap-1 border-part/40 bg-part/10 px-2 py-0.5 text-[11px] text-part"
                  title={t`Part of ${book.part.sourceLabel}`}
                >
                  <Puzzle className="h-3 w-3" />
                  <Trans>
                    Part · pages {book.part.range.startPage}–{book.part.range.endPage}
                  </Trans>
                </Badge>
              )}
              {book.split && (
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 px-2 py-0.5 text-[11px]",
                    book.split.fullyMerged
                      ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                      : "border-part/40 bg-part/10 text-part",
                  )}
                  title={t`Split into ${book.split.exportedParts} part(s) · ${book.split.splitPages}/${book.split.totalPages} pages split off · ${book.split.mergedPages}/${book.split.totalPages} merged back`}
                >
                  <Scissors className="h-3 w-3" />
                  {book.split.fullyMerged ? (
                    // Done: every page split off and merged back.
                    <Trans>All parts merged</Trans>
                  ) : !book.split.fullySplit ? (
                    // Still carving: how much has been handed out as parts.
                    <Trans>Split · {book.split.splitPages}/{book.split.totalPages}</Trans>
                  ) : (
                    // Fully split, now collecting completed parts back.
                    <Trans>Merged · {book.split.mergedPages}/{book.split.totalPages}</Trans>
                  )}
                </Badge>
              )}
              {book.needsRebuild && (
                <Badge variant="destructive" className="text-[11px] px-2 py-0.5">
                  <Trans>Needs rebuild</Trans>
                </Badge>
              )}
              {book.languageCode && (
                <Badge variant="outline" className="text-[11px] px-2 py-0.5">
                  {book.languageCode.toUpperCase()}
                </Badge>
              )}
              {!book.needsRebuild && !book.split && (
                <Badge
                  variant={book.pageCount > 0 ? "default" : "secondary"}
                  className="text-[11px] px-2 py-0.5"
                >
                  {book.pageCount > 0
                    ? `${book.pageCount} ${
                        book.pageCount === 1
                          ? t`page`
                          : t`pages`
                      }`
                    : <Trans>New</Trans>}
                </Badge>
              )}
              {!book.hasSourcePdf && (
                <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                  <Trans>No PDF</Trans>
                </Badge>
              )}
            </div>
          </div>

          {/* Rebuild warning */}
          {book.needsRebuild && (
            <p className="text-sm text-destructive mb-2">
              {book.rebuildReason ?? t`Book data is outdated and must be rebuilt.`}
            </p>
          )}

          {/* Details */}
          {hasMetadata ? (
            <div className="space-y-1.5">
              {book.title && (
                <DetailRow icon={FileText} label={t`Label`} value={book.label} />
              )}
              {book.authors.length > 0 && (
                <DetailRow
                  icon={User}
                  label={book.authors.length > 1 ? t`Authors` : t`Author`}
                  value={book.authors.join(", ")}
                />
              )}
              {book.publisher && (
                <DetailRow
                  icon={Building2}
                  label={t`Publisher`}
                  value={book.publisher}
                />
              )}
              {book.languageCode && (
                <DetailRow
                  icon={Globe}
                  label={t`Language`}
                  value={book.languageCode.toUpperCase()}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              <Trans>No metadata yet — run the pipeline to extract book details</Trans>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarPlus className="h-3 w-3" />
              <Trans>Created {createdLabel}</Trans>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <Trans>Modified {modifiedLabel}</Trans>
            </span>
          </div>

          <CompletedStageBadges
            completedSet={completedSet}
            pipelineStages={pipelineStages}
          />
          </div>
        </Link>

        {/* Actions — always visible */}
        <div className="flex flex-col items-center justify-center gap-1 border-l px-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            asChild
          >
            <Link
              to="/books/$label/$step"
              params={{ label: book.label, step: "book" }}
              aria-label={t`Edit ${book.title ?? book.label}`}
            >
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(book.label)}
            aria-label={t`Delete ${book.title ?? book.label}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function HomePage() {
  const { t } = useLingui()
  usePageTitle(t`Your Books`)
  const { data: books, isLoading, error } = useBooks()
  const deleteMutation = useDeleteBook()
  const [deleteLabel, setDeleteLabel] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<BookSortKey>(() => readStoredSort())
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(BOOK_SORT_STORAGE_KEY, sortKey)
  }, [sortKey])

  const filteredBooks = useMemo(() => {
    const list = books ?? []
    const query = search.trim().toLowerCase()
    if (!query) return list
    return list.filter((book) => {
      const title = book.title?.toLowerCase() ?? ""
      const label = book.label.toLowerCase()
      return title.includes(query) || label.includes(query)
    })
  }, [books, search])

  const visibleBooks = useMemo(
    () => sortBooks(filteredBooks, sortKey),
    [filteredBooks, sortKey],
  )

  const listRef = useFlipList(visibleBooks, (book) => book.label)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 text-muted-foreground">
        <Trans>Loading books...</Trans>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center flex-1 text-destructive">
        <Trans>Failed to load books: {error.message}</Trans>
      </div>
    )
  }

  const totalBooks = books?.length ?? 0
  const hasActiveSearch = search.trim().length > 0
  const hiddenByFilter = hasActiveSearch && totalBooks > 0 && visibleBooks.length === 0

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <StudioTopBar />

      <div className="flex flex-1 min-h-0">
      {/* Left — pipeline stages (30%) */}
      <div className="w-[30%] shrink-0 border-r bg-muted/30 flex flex-col overflow-auto">
        <div className="px-5 pt-5 pb-5 flex-1">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            <Trans>Pipeline Stages</Trans>
          </h2>
          <div className="space-y-1">
            {PIPELINE_STEPS.map((step, i) => {
              const Icon = step.icon
              const label = getStageLabelI18n(step.slug)
              const description = getStageDescriptionI18n(step.slug) ?? ""

              return (
                <div
                  key={step.slug}
                  className="flex gap-3 p-2.5 rounded-lg"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step.color} text-white`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="min-w-0 pb-1">
                    <span className="text-sm font-medium">{label}</span>
                    {!!description && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <Link
            to="/books/new"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors"
          >
            <Trans>Get started</Trans> <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Right — books list (70%) */}
      <div className="flex-1 min-w-0 overflow-auto p-5">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h1 className="text-sm font-medium text-muted-foreground">
            <Trans>Your Books</Trans>
            {totalBooks > 0 && (
              <span
                key={hasActiveSearch ? `${visibleBooks.length}/${totalBooks}` : `${totalBooks}`}
                className="ml-1 inline-block animate-count-pulse"
              >
                {hasActiveSearch
                  ? `(${visibleBooks.length}/${totalBooks})`
                  : `(${totalBooks})`}
              </span>
            )}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/books/import" className="gap-1.5 text-muted-foreground">
                <Upload className="h-3.5 w-3.5" />
                <Trans>Import project</Trans>
              </Link>
            </Button>
            {totalBooks > 1 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t`Search books...`}
                  aria-label={t`Search books`}
                  className="h-8 w-[200px] pl-8 text-xs"
                />
              </div>
            )}
            {totalBooks > 1 && (
              <Select
                value={sortKey}
                onValueChange={(value) => setSortKey(value as BookSortKey)}
              >
                <SelectTrigger
                  aria-label={t`Sort books`}
                  className="h-8 w-[160px] text-xs transition-colors"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="modified">
                    <Trans>Last modified</Trans>
                  </SelectItem>
                  <SelectItem value="created">
                    <Trans>Newest first</Trans>
                  </SelectItem>
                  <SelectItem value="alphabetical">
                    <Trans>A–Z</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/books/new" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                <Trans>Add Book</Trans>
              </Link>
            </Button>
          </div>
        </div>
        <div ref={listRef} className="space-y-3">
          {visibleBooks.map((book, index) => (
            <div
              key={book.label}
              data-flip-key={book.label}
              className="animate-wizard-enter will-change-transform"
              style={{
                animationDelay: `${Math.min(index, 8) * 40}ms`,
                animationFillMode: "both",
              }}
            >
              <BookRow
                book={book}
                onDelete={setDeleteLabel}
                pipelineStages={PIPELINE_STEPS}
              />
            </div>
          ))}
          {hiddenByFilter && (
            <div className="flex animate-wizard-enter flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/30 py-16">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium">
                <Trans>No books match your search</Trans>
              </span>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-2 text-xs text-primary transition-colors hover:underline"
              >
                <Trans>Clear search</Trans>
              </button>
            </div>
          )}
          {!hiddenByFilter && visibleBooks.length === 0 && (
            <Link to="/books/new" className="block animate-wizard-enter">
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/30 py-16 transition-all hover:border-primary/40 hover:bg-primary/5 cursor-pointer">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
                  <Plus className="h-6 w-6 text-primary" />
                </div>
                <span className="text-sm font-medium">
                  <Trans>Add your first book</Trans>
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  <Trans>Upload a PDF to get started</Trans>
                </span>
              </div>
            </Link>
          )}
        </div>
      </div>
      </div>

      <DeleteBookDialog
        label={deleteLabel}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteLabel) {
            deleteMutation.mutate(deleteLabel, {
              onSuccess: () => setDeleteLabel(null),
            })
          }
        }}
        onCancel={() => setDeleteLabel(null)}
      />
    </div>
  )
}
