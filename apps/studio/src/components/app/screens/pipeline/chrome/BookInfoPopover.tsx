import { useState, type CSSProperties } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Settings } from "lucide-react"
import { BookCover } from "@/components/app/BookCover"
import { deriveCover } from "@/components/app/data"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useBook } from "@/hooks/use-books"
import { getDisplayName } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { usePipelineNavigation } from "../shared/usePipelineNavigation"

export interface BookInfoPopoverProps {
  label: string
  triggerClassName?: string
  triggerStyle?: CSSProperties
  withLabel?: boolean
  align?: "start" | "center" | "end"
}

export function BookInfoPopover({ label, triggerClassName, triggerStyle, withLabel = false, align = "end" }: BookInfoPopoverProps) {
  const { t, i18n } = useLingui()
  const { data: book } = useBook(label)
  const nav = usePipelineNavigation(label)
  const [open, setOpen] = useState(false)

  const title = book?.title || label
  const authors = book?.authors.filter(Boolean) ?? []
  const summary = book?.bookSummary?.summary?.trim()
  const language = book?.languageCode ? getDisplayName(book.languageCode) : null
  const edited = book?.modifiedAt
    ? new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium" }).format(new Date(book.modifiedAt))
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t`Book info`}
          aria-label={withLabel ? undefined : t`Book info`}
          className={cn(withLabel ? "flex items-center gap-1.5" : "grid place-items-center", triggerClassName)}
          style={triggerStyle}
        >
          <BookOpen className="size-3.5" />
          {withLabel && <Trans>Book info</Trans>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={8}
        aria-label={t`Book info`}
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement | null)?.focus()
        }}
        className="w-[340px] p-0 outline-none"
      >
        <div className="flex gap-3.5 p-4">
          {book && (
            <div className="h-[84px] w-[62px] shrink-0">
              <BookCover title={title} author={authors[0] ?? ""} cover={deriveCover(book)} fit="cover" />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">{title}</p>
            {authors.length > 0 && <p className="truncate text-[12px] text-muted-foreground">{authors.join(", ")}</p>}
            {book?.publisher && <p className="truncate text-[12px] text-muted-foreground">{book.publisher}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-px border-y bg-border text-[11px]">
          <div className="flex flex-col gap-0.5 bg-popover px-4 py-2.5">
            <dt className="text-muted-foreground">
              <Trans>Pages</Trans>
            </dt>
            <dd className="font-semibold tabular-nums text-foreground">{book?.pageCount ?? "—"}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 bg-popover px-4 py-2.5">
            <dt className="text-muted-foreground">
              <Trans>Language</Trans>
            </dt>
            <dd className="truncate font-semibold text-foreground">{language ?? "—"}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 bg-popover px-4 py-2.5">
            <dt className="text-muted-foreground">
              <Trans>Edited</Trans>
            </dt>
            <dd className="truncate font-semibold text-foreground">{edited ?? "—"}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1.5 px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Trans>Summary</Trans>
          </p>
          <p className={cn("text-[12.5px] leading-relaxed", summary ? "line-clamp-5 text-foreground" : "text-muted-foreground")}>
            {summary ?? <Trans>A short summary appears here once Extract has run.</Trans>}
          </p>
        </div>

        <div className="border-t p-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              nav.openBookInfo()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Settings className="size-3.5 text-muted-foreground" />
            <Trans>Book settings</Trans>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
