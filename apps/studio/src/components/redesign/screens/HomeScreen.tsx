import { useMemo } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Trans, Plural } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n } from "@lingui/core"
import { Plus, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BookCover } from "@/components/redesign/shared/BookCover"
import { StageDiscs } from "@/components/redesign/shared/ui/StageDiscs"
import { Eyebrow } from "@/components/redesign/shared/ui/Eyebrow"
import { ScreenFallback } from "@/components/redesign/shared/ui/ScreenFallback"
import { WelcomeHero } from "./home/WelcomeHero"
import { FeatureTour } from "./home/FeatureTour"
import { SplitsSummaryCard } from "./home/SplitsSummaryCard"
import { toBookVM, type BookVM } from "@/components/redesign/shared/data"
import { REDESIGN_PATHS } from "@/components/redesign/shared/nav"
import { useRedesignBooks } from "@/components/redesign/shared/hooks/use-redesign-books"
import { useOpenBook } from "@/components/redesign/shared/hooks/use-open-book"
import { useRedesignShell } from "../RedesignShellContext"
import { TopBar } from "@/components/title-bar/TopBar"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return i18n._(msg`Good morning.`)
  if (h < 18) return i18n._(msg`Good afternoon.`)
  return i18n._(msg`Good evening.`)
}

const sectionLabel = "text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground"

function RecentBookCard({ book, onOpen }: { book: BookVM; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-[170px] shrink-0 flex-col gap-2.5 text-left">
      <div className="h-[220px] w-[170px] overflow-hidden rounded-[9px] shadow-md">
        <BookCover title={book.displayTitle} author={book.authors} cover={book.cover} />
      </div>
      <div>
        <div className="truncate text-[12.5px] font-semibold leading-tight">{book.displayTitle}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {book.authors} · {book.pagesText}
        </div>
        {book.hasStages && <StageDiscs discs={book.discs} size={22} max={5} className="mt-2" />}
      </div>
    </button>
  )
}

export function HomeScreen() {
  const navigate = useNavigate()
  const { books, locale, isLoading, error } = useRedesignBooks()
  const { openAdd } = useRedesignShell()
  const openBook = useOpenBook()
  const previewBook = (label: string) => navigate({ to: "/books/$label/$step", params: { label, step: "preview" } })

  const vms = useMemo(() => {
    const sorted = [...books].sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    return sorted.map((b) => toBookVM(b, locale))
  }, [books, locale])

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }),
    [locale],
  )

  if (isLoading || error) return <ScreenFallback error={error} />

  const feature = vms[0]
  const recents = vms.slice(1, 8)
  const splitCount = books.filter((b) => b.split && !b.split.fullyMerged).length
  const dateLabel = dateFormat.format(new Date())

  return (
    <div className="flex flex-col relative h-full bg-background pt-8">

      <TopBar className="absolute top-0 drag-region" />

      <div className="pointer-events-none absolute -top-[120px] right-[-80px] size-[440px] animate-hero-drift rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.12),transparent_70%)]" />
      <div className="relative px-8 pb-6">

        {feature ? (
          <>
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
            <div className={`mb-2.5 mt-3.5 ${sectionLabel}`}>
              <Trans>Jump back in</Trans>
            </div>
            <div className="flex gap-5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => openBook(feature.label)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openBook(feature.label)
                }}
                className="group flex flex-1 cursor-pointer items-stretch overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-[transform,border-color,box-shadow] hover:-translate-y-px hover:border-brand-300 hover:shadow-md"
              >
                <div className="w-[250px] shrink-0 self-stretch">
                  <BookCover title={feature.displayTitle} author={feature.authors} cover={feature.cover} />
                </div>
                <div className="flex flex-col justify-center gap-2.5 px-5 py-3.5">
                  <div>
                    <div className={`mb-[7px] ${sectionLabel}`}>
                      <Trans>Last edited {feature.modified}</Trans>
                    </div>
                    <h3 className="text-2xl font-bold leading-[1.15] tracking-[-0.02em]">{feature.displayTitle}</h3>
                    <div className="mt-1.5 text-sm text-muted-foreground">
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        previewBook(feature.label)
                      }}
                    >
                      <Trans>Preview</Trans>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex w-[230px] flex-col gap-2.5">
                <button
                  type="button"
                  onClick={openAdd}
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
                <SplitsSummaryCard books={books} onOpen={() => navigate({ to: REDESIGN_PATHS.handoffs })} />
              </div>
            </div>
          </>
        ) : (
          <>
            <WelcomeHero onOpenAdd={openAdd} />
            <FeatureTour />
          </>
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
              <Link
                to={REDESIGN_PATHS.library}
                className="ml-auto text-[12.5px] font-medium text-brand-700 hover:underline"
              >
                <Trans>View all →</Trans>
              </Link>
            </div>
            <ScrollArea type="hover">
              <div className="flex w-max gap-[16px] pb-3">
                <button
                  type="button"
                  onClick={openAdd}
                  className="flex w-[170px] shrink-0 flex-col gap-2.5 text-left"
                >
                  <span className="grid h-[220px] w-[170px] place-items-center rounded-[9px] border-2 border-dashed text-muted-foreground transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600">
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
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  )
}
