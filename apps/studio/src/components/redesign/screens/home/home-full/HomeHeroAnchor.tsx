import { useMemo } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { BookCover } from "../../../BookCover"
import { StageBar, ContinueLabel, ShelfCard, AddBookTile, LibraryLink, OutputsPanel, pickResume, type HomeVariantProps } from "./kit"

/**
 * Home A — "Hero Anchor".
 * A genuinely large, cover-forward resume hero + one centered shelf row of quiet
 * recognition tiles. No scroll; the composition is vertically centered so it
 * fills the screen with breathing room at any book count.
 */
export function HomeHeroAnchor({ books, pinnedLabels, onOpen, onContinue, onAddBook, onOpenLibrary }: HomeVariantProps) {
  const continueBook = onContinue ?? onOpen
  const pins = pinnedLabels ?? new Set<string>()
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()), [])
  const sorted = useMemo(() => [...books].sort((a, b) => new Date(b.raw.modifiedAt).getTime() - new Date(a.raw.modifiedAt).getTime()), [books])

  const resume = pickResume(sorted)
  const rest = sorted.filter((b) => b.label !== resume?.label)
  const shelf = [...rest.filter((b) => pins.has(b.label)), ...rest.filter((b) => !pins.has(b.label))].slice(0, 5)

  return (
    <div className="flex h-full flex-col px-10 py-8">
      <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{dateLabel}</div>

      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col justify-center gap-12 py-4">
        {resume && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(resume.label)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? (e.preventDefault(), onOpen(resume.label)) : undefined)}
            className="group flex cursor-pointer items-stretch gap-10 rounded-3xl border bg-card p-8 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <div className="h-[336px] w-[240px] shrink-0 overflow-hidden rounded-xl shadow-xl ring-1 ring-black/5 transition-transform duration-200 group-hover:-translate-y-0.5">
              <BookCover title={resume.displayTitle} author={resume.authors} cover={resume.cover} fit="cover" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <Trans>Pick up where you left off · {resume.modified}</Trans>
              </div>
              <h1 className="mt-2.5 truncate text-[36px] font-bold leading-[1.08] tracking-[-0.025em]">{resume.displayTitle}</h1>
              <div className="mt-1.5 text-[14.5px] text-muted-foreground">
                {resume.authors} · {resume.pagesText}
              </div>
              <StageBar vm={resume} labels className="mt-6 max-w-[380px]" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  continueBook(resume.label)
                }}
                className="mt-7 inline-flex w-fit cursor-pointer items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[14px] font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
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
  )
}
