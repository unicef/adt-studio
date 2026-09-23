import { Fragment, useMemo, type ReactNode } from "react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { ArrowRight, ExternalLink, MessageSquare, Share2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/sonner"
import { BookCover } from "../../BookCover"
import { formatRelative, type BookVM } from "../../data"
import { ContinueLabel, ShelfCard, AddBookTile, LibraryLink, OutputsPanel, SharedBadge, openComments, pickResume, isActive, isShared, type HomeVariantProps } from "../shared/kit"

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

/**
 * The two things done with a shared link — open it, or send it — as round buttons at the end of
 * the card's own actions. The address itself stays off the card: it is long, and nobody reads it
 * to use it.
 */
function SharedLinkActions({ url }: { url: string }) {
  const { t } = useLingui()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t`Link copied to the clipboard`)
    } catch {
      toast.error(t`Couldn't copy the link — open the book's Sharing step and copy it there.`)
    }
  }
  const round =
    "grid size-[46px] shrink-0 cursor-pointer place-items-center rounded-full border bg-card text-muted-foreground transition-[background-color,border-color,color,transform] duration-150 hover:border-brand-300 hover:bg-brand-500/5 hover:text-foreground active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={t`Open the shared book`}
            className={round}
          >
            <ExternalLink className="size-4" aria-hidden />
          </a>
        </TooltipTrigger>
        <TooltipContent>{t`Open the shared book`}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void copy()
            }}
            aria-label={t`Copy the link to send`}
            className={round}
          >
            <Share2 className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t`Copy the link to send`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function HomeHeroAnchor({ books, pinnedLabels, onOpen, onContinue, onAddBook, onOpenLibrary, onReview }: HomeVariantProps) {
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
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{greeting}</h1>
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
            <div className="relative h-[336px] w-[240px] shrink-0 overflow-hidden rounded-xl shadow-xl ring-1 ring-black/5 transition-transform duration-200 group-hover:-translate-y-0.5">
              <BookCover title={resume.displayTitle} author={resume.authors} cover={resume.cover} fit="cover" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <Trans>Pick up where you left off · {resume.modified}</Trans>
                </span>
                {/* Beside the line that says where the author is, not in the details below it:
                    sharing is the one state here that changes, and the details line runs long. */}
                {isShared(resume) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                    <Trans>Shared</Trans>
                  </span>
                )}
              </div>
              <h2 className="mt-2.5 truncate text-[42px] font-bold leading-[1.05] tracking-[-0.025em]">{resume.displayTitle}</h2>
              <div className="mt-1.5 text-[14.5px] text-muted-foreground">{resume.authors}</div>
              <ResumeMeta vm={resume} locale={i18n.locale} />
              <div className="relative z-20 mt-7 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    continueBook(resume.label)
                  }}
                  className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[14px] font-semibold text-primary-foreground transition-[background-color,transform] [&>svg]:transition-transform hover:bg-brand-700 hover:[&>svg]:translate-x-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  <ContinueLabel vm={resume} />
                  <ArrowRight className="size-4" />
                </button>
                {/* Home is "what next", and comments waiting on the book Home puts first usually
                    are what is next — so they earn a way in here, quieter than Continue. */}
                {onReview && openComments(resume) > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onReview(resume.label)
                    }}
                    className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border bg-card px-5 py-3 text-[14px] font-semibold text-foreground transition-[background-color,border-color,transform] hover:border-brand-300 hover:bg-brand-500/5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                  >
                    <MessageSquare className="size-4 text-brand-600" aria-hidden />
                    <Plural value={openComments(resume)} one="Review # comment" other="Review # comments" />
                  </button>
                )}
                {isShared(resume) && resume.publication?.url ? <SharedLinkActions url={resume.publication.url} /> : null}
              </div>
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
              <ShelfCard
                key={vm.label}
                vm={vm}
                onOpen={onOpen}
                pinned={pins.has(vm.label)}
                progress
                badge={isShared(vm) ? <SharedBadge /> : undefined}
                comments={openComments(vm)}
              />
            ))}
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}
