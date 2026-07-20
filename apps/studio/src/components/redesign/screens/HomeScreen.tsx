import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, Plural } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n } from "@lingui/core"
import { Plus, Scissors, ArrowRight } from "lucide-react"
import type { BookSummary } from "@/api/client"
import { Button } from "@/components/ui/button"
import { BookCover } from "../BookCover"
import { StageDiscs } from "../ui/StageDiscs"
import { Eyebrow } from "../ui/Eyebrow"
import { toBookVM, type BookVM } from "../data"
import type { RedesignView } from "../types"

export interface HomeScreenProps {
  books: BookSummary[]
  locale: string
  onOpenAdd: () => void
  onNavigate: (view: RedesignView) => void
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return i18n._(msg`Good morning.`)
  if (h < 18) return i18n._(msg`Good afternoon.`)
  return i18n._(msg`Good evening.`)
}

const sectionLabel = "text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground"

function RecentBookCard({ book, onOpen }: { book: BookVM; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-[150px] shrink-0 flex-col gap-2.5 text-left">
      <div className="h-[200px] w-[150px] overflow-hidden rounded-[9px] shadow-md">
        <BookCover title={book.displayTitle} author={book.authors} cover={book.cover} />
      </div>
      <div>
        <div className="truncate text-[12.5px] font-semibold leading-tight">{book.displayTitle}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {book.authors} · {book.pagesText}
        </div>
        {book.hasStages && <StageDiscs discs={book.discs} size={18} max={5} className="mt-2" />}
      </div>
    </button>
  )
}

export function HomeScreen({ books, locale, onOpenAdd, onNavigate }: HomeScreenProps) {
  const navigate = useNavigate()
  const openBook = (label: string) => navigate({ to: "/books/$label/$step", params: { label, step: "book" } })

  const vms = useMemo(() => {
    const sorted = [...books].sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    return sorted.map((b) => toBookVM(b, locale))
  }, [books, locale])

  const feature = vms[0]
  const recents = vms.slice(1, 8)
  const splitCount = books.filter((b) => b.split && !b.split.fullyMerged).length
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }).format(new Date())

  return (
    <div className="relative h-full overflow-auto bg-background px-[34px] pb-6 pt-3.5">
      <div className="drift pointer-events-none absolute -top-[120px] right-[-80px] size-[440px] rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.12),transparent_70%)]" />
      <div className="relative">
        <Eyebrow>{dateLabel}</Eyebrow>
        <div className="mb-[3px] mt-1.5 text-2xl font-bold leading-[1.1] tracking-[-0.025em]">{greeting()}</div>
        <div className="text-[15px] text-muted-foreground">
          <Plural value={books.length} one="# book in production" other="# books in production" />
          {splitCount > 0 && (
            <>
              {" · "}
              <Plural value={splitCount} one="# split in progress" other="# splits in progress" />
            </>
          )}
          {"."}
        </div>

        {feature ? (
          <>
            <div className={`mb-2.5 mt-3.5 ${sectionLabel}`}>
              <Trans>Jump back in</Trans>
            </div>
            <div className="flex gap-5">
              <button
                type="button"
                onClick={() => openBook(feature.label)}
                className="group flex flex-1 items-stretch overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-px hover:border-brand-300 hover:shadow-md"
              >
                <div className="w-[150px] shrink-0 self-stretch">
                  <BookCover title={feature.displayTitle} author={feature.authors} cover={feature.cover} />
                </div>
                <div className="flex flex-col justify-center gap-2.5 px-5 py-3.5">
                  <div>
                    <div className={`mb-[7px] ${sectionLabel}`}>
                      <Trans>Last edited {feature.modified}</Trans>
                    </div>
                    <h3 className="text-xl font-bold leading-[1.15] tracking-[-0.02em]">{feature.displayTitle}</h3>
                    <div className="mt-1.5 text-[13px] text-muted-foreground">
                      {feature.authors} · {feature.pagesText}
                    </div>
                  </div>
                  {feature.hasStages && <StageDiscs discs={feature.discs} />}
                  <div className="mt-0.5 flex gap-2.5">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        openBook(feature.label)
                      }}
                    >
                      <Trans>Continue editing</Trans>
                      <ArrowRight className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                      <Trans>Preview</Trans>
                    </Button>
                  </div>
                </div>
              </button>

              <div className="flex w-[230px] flex-col gap-2.5">
                <button
                  type="button"
                  onClick={onOpenAdd}
                  className="flex flex-1 flex-col gap-[7px] rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-brand-300"
                >
                  <span className="grid size-[34px] place-items-center rounded-[9px] bg-brand-50 text-brand-600">
                    <Plus className="size-5" />
                  </span>
                  <span className="text-sm font-semibold">
                    <Trans>New book</Trans>
                  </span>
                  <span className="text-xs leading-[1.45] text-muted-foreground">
                    <Trans>Upload a PDF to begin.</Trans>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("handoffs")}
                  className="flex flex-1 flex-col gap-[7px] rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-brand-300"
                >
                  <span className="grid size-[34px] place-items-center rounded-[9px] bg-brand-50 text-brand-700">
                    <Scissors className="size-5" />
                  </span>
                  <span className="text-sm font-semibold">
                    <Trans>Split & merge</Trans>
                  </span>
                  <span className="text-xs leading-[1.45] text-muted-foreground">
                    <Trans>Break a book into parts and merge them back.</Trans>
                  </span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpenAdd}
            className="mt-[22px] flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-card px-5 py-14 transition-colors hover:border-brand-400 hover:bg-brand-50/40"
          >
            <span className="grid size-[46px] place-items-center rounded-full bg-brand-50 text-brand-600">
              <Plus className="size-[22px]" />
            </span>
            <span className="text-[15px] font-semibold">
              <Trans>Add your first book</Trans>
            </span>
            <span className="text-[12.5px] text-muted-foreground">
              <Trans>Upload a PDF to get started</Trans>
            </span>
          </button>
        )}

        {feature && (
          <>
            <div className="mb-2.5 mt-4 flex items-baseline">
              <span className="text-base font-bold tracking-[-0.01em]">
                <Trans>Your library</Trans>
              </span>
              <span className="ml-2.5 text-[13px] text-muted-foreground">
                <Plural value={books.length} one="# book" other="# books" />
              </span>
              <button
                type="button"
                onClick={() => onNavigate("library")}
                className="ml-auto text-[12.5px] font-medium text-brand-700 hover:underline"
              >
                <Trans>View all →</Trans>
              </button>
            </div>
            <div className="flex gap-[18px] overflow-x-auto pb-1">
              <button
                type="button"
                onClick={onOpenAdd}
                className="flex w-[150px] shrink-0 flex-col gap-2.5 text-left"
              >
                <span className="grid h-[200px] w-[150px] place-items-center rounded-[9px] border-2 border-dashed text-muted-foreground transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600">
                  <Plus className="size-5" />
                </span>
                <span className="text-[12.5px] font-medium text-muted-foreground">
                  <Trans>Add new book</Trans>
                </span>
              </button>
              {recents.map((b) => (
                <RecentBookCard key={b.label} book={b} onOpen={() => openBook(b.label)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
