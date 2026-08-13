import { Fragment, useMemo, type ReactNode } from "react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { BookCover } from "../../../BookCover"
import { formatRelative, type BookVM } from "../../../data"
import { ContinueLabel, ShelfCard, AddBookTile, LibraryLink, OutputsPanel, pickResume, isActive, type HomeVariantProps } from "./kit"

function languageName(code: string | null | undefined, locale: string): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

function ResumeMeta({ vm, locale }: { vm: BookVM; locale: string }) {
  const parts: ReactNode[] = [vm.pagesText]
  const lang = languageName(vm.raw.languageCode, locale)
  if (lang) parts.push(lang)
  if (vm.raw.publisher) parts.push(vm.raw.publisher)
  if (vm.raw.createdAt) parts.push(<Trans>Added {formatRelative(vm.raw.createdAt, locale)}</Trans>)

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-muted-foreground">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden className="text-muted-foreground/40">·</span>}
          <span>{p}</span>
        </Fragment>
      ))}
    </div>
  )
}

export function HomeHeroAnchor({ books, pinnedLabels, onOpen, onContinue, onAddBook, onOpenLibrary }: HomeVariantProps) {
  const { t, i18n } = useLingui()
  const continueBook = onContinue ?? onOpen
  const pins = pinnedLabels ?? new Set<string>()
  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat(i18n.locale, { weekday: "long", month: "long", day: "numeric" }).format(new Date()),
    [i18n.locale],
  )
  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return t`Good morning`
    if (hour < 18) return t`Good afternoon`
    return t`Good evening`
  })()
  const inProgress = books.filter(isActive).length
  const sorted = useMemo(() => [...books].sort((a, b) => new Date(b.raw.modifiedAt).getTime() - new Date(a.raw.modifiedAt).getTime()), [books])

  const resume = pickResume(sorted)
  const rest = sorted.filter((b) => b.label !== resume?.label)
  const shelf = [...rest.filter((b) => pins.has(b.label)), ...rest.filter((b) => !pins.has(b.label))].slice(0, 5)

  return (
    <div className="flex h-full flex-col overflow-y-auto px-10 pb-8 pt-5">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col pb-4">
        <div>
          <h2 className="text-[26px] font-bold tracking-[-0.02em]">{greeting}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13.5px] text-muted-foreground">
            <span>
              <Plural value={books.length} one="# book in your library" other="# books in your library" />
            </span>
            {inProgress > 0 && (
              <>
                <span aria-hidden className="text-muted-foreground/40">·</span>
                <span>
                  <Plural value={inProgress} one="# in progress" other="# in progress" />
                </span>
              </>
            )}
            <span aria-hidden className="text-muted-foreground/40">·</span>
            <span>{dateLabel}</span>
          </div>
        </div>
        <div className="mt-5 flex flex-1 flex-col justify-start gap-10">
        {resume && (
          <div className="group relative flex items-stretch gap-10 rounded-3xl border bg-card p-8 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg">
            <button
              type="button"
              aria-label={resume.displayTitle}
              onClick={() => onOpen(resume.label)}
              className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            <div className="h-[336px] w-[240px] shrink-0 overflow-hidden rounded-xl shadow-xl ring-1 ring-black/5 transition-transform duration-200 group-hover:-translate-y-0.5">
              <BookCover title={resume.displayTitle} author={resume.authors} cover={resume.cover} fit="cover" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <Trans>Pick up where you left off · {resume.modified}</Trans>
              </div>
              <h1 className="mt-2.5 truncate text-[42px] font-bold leading-[1.05] tracking-[-0.025em]">{resume.displayTitle}</h1>
              <div className="mt-1.5 text-[14.5px] text-muted-foreground">{resume.authors}</div>
              <ResumeMeta vm={resume} locale={i18n.locale} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  continueBook(resume.label)
                }}
                className="relative z-20 mt-7 inline-flex w-fit cursor-pointer items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[14px] font-semibold text-white transition-[background-color,transform] [&>svg]:transition-transform hover:bg-brand-700 hover:[&>svg]:translate-x-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <ContinueLabel vm={resume} />
                <ArrowRight className="size-4" />
              </button>
            </div>
            <OutputsPanel vm={resume} className="hidden self-stretch border-l pl-10 lg:block" />
          </div>
        )}

        <section>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground">
              <Trans>Recent</Trans>
            </h2>
            <LibraryLink count={books.length} onClick={onOpenLibrary} />
          </div>
          <div className="grid grid-cols-6 items-start gap-6">
            <AddBookTile onClick={onAddBook} />
            {shelf.map((vm) => (
              <ShelfCard key={vm.label} vm={vm} onOpen={onOpen} pinned={pins.has(vm.label)} progress />
            ))}
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}
