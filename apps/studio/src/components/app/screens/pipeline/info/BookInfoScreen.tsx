import type { ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, BookMarked, X } from "lucide-react"
import type { BookDetail } from "@/api/client"
import { STAGES } from "@/components/pipeline/stage-config"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { NO_DRAG_REGION } from "@/constants"
import { useBook } from "@/hooks/use-books"
import { BookCover } from "@/components/app/BookCover"
import { deriveCover } from "@/components/app/data"
import { ScreenFallback } from "@/components/app/ui/ScreenFallback"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"

const BOOK_HEX = STAGES.find((stage) => stage.slug === "book")?.hex ?? "#4b5563"

function languageName(code: string, locale: string): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

function formatDate(iso: string, locale: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ""
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(time)
}

export interface BookInfoScreenProps {
  label: string
  onBack: () => void
}

/** The book's cover and the metadata this conversion is running on, framed by
 *  the pipeline shell. Read-only — editing happens in the metadata settings. */
export function BookInfoScreen({ label, onBack }: BookInfoScreenProps) {
  const { t, i18n } = useLingui()
  const { data: book, error } = useBook(label)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header
        className="drag-region flex h-12.5 shrink-0 items-center gap-3 px-3.5 text-white"
        style={{ background: BOOK_HEX }}
      >
        <button
          type="button"
          onClick={onBack}
          style={NO_DRAG_REGION}
          className="flex h-7 items-center gap-1.5 rounded-lg bg-white/16 px-2.5 text-xs font-semibold transition-colors hover:bg-white/24"
        >
          <ArrowLeft className="size-3.5" />
          <Trans>Storyboard</Trans>
        </button>

        <span className="grid size-6.5 place-items-center rounded-full bg-white/20">
          <BookMarked className="size-3.5" strokeWidth={2.4} />
        </span>
        <span className="text-sm font-semibold">
          <Trans>Book information</Trans>
        </span>

        <div className="flex-1" />

        <div style={NO_DRAG_REGION} className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label={t`Close book information`}
            title={t`Close book information`}
            className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-white/16"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <TitleBarControls darkMode className="-my-px -mr-3.5 h-12.5" />
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {book ? (
          <BookInfoBody book={book} locale={i18n.locale} />
        ) : (
          <ScreenFallback error={(error as Error | null) ?? null} />
        )}
      </div>
    </div>
  )
}

function BookInfoBody({ book, locale }: { book: BookDetail; locale: string }) {
  const cover = deriveCover(book)
  const title = book.metadata?.title ?? book.title ?? book.label
  const authors = (book.metadata?.authors?.length ? book.metadata.authors : book.authors).join(", ")
  const publisher = book.metadata?.publisher ?? book.publisher
  const code = book.languageCode ?? book.metadata?.language_code

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-7 py-8 sm:flex-row">
      <div
        className="grid h-fit shrink-0 place-items-center rounded-2xl p-7"
        style={{ background: tint(BOOK_HEX, 0.08) }}
      >
        <div
          className="h-[286px] w-[214px] overflow-hidden rounded-[10px]"
          style={{ boxShadow: "0 22px 46px -14px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.08)" }}
        >
          <BookCover title={title} author={authors} cover={cover} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="text-[21px] font-semibold tracking-[-0.01em]">{title}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {authors || <Trans>Unknown author</Trans>}
        </p>

        <dl className="mt-6 rounded-xl border px-4 py-1">
          <InfoRow label={<Trans>Title</Trans>} value={book.metadata?.title ?? book.title} />
          <InfoRow label={<Trans>Authors</Trans>} value={authors} />
          <InfoRow label={<Trans>Publisher</Trans>} value={publisher} />
          <InfoRow
            label={<Trans>Language</Trans>}
            value={code ? languageName(code, locale) : null}
          />
          <InfoRow
            label={<Trans>Pages</Trans>}
            value={
              book.pageCount > 0 ? (
                <Plural value={book.pageCount} one="# page" other="# pages" />
              ) : null
            }
          />
          <InfoRow label={<Trans>Identifier</Trans>} value={book.label} />
          <InfoRow label={<Trans>Created</Trans>} value={formatDate(book.createdAt, locale)} />
          <InfoRow
            label={<Trans>Last modified</Trans>}
            value={formatDate(book.modifiedAt, locale)}
          />
        </dl>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  const empty = value === null || value === undefined || value === ""
  return (
    <div className="flex gap-4 border-b py-2.5 last:border-b-0">
      <dt className="w-36 shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-[13px] font-medium">
        {empty ? <span className="text-muted-foreground/60">—</span> : value}
      </dd>
    </div>
  )
}
