import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Pager } from "../ui/Pager"
import { ScreenFallback } from "../ui/ScreenFallback"
import { useRedesignBooks } from "../use-redesign-books"
import { HandoffsEmptyState } from "./handoffs/HandoffsEmptyState"
import { SplitSummaryCard } from "./handoffs/SplitSummaryCard"
import { ContributionRow } from "./handoffs/ContributionRow"

const PAGE_SIZE = 4
const sectionLabel = "text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground"

export function HandoffsScreen() {
  const navigate = useNavigate()
  const { books, locale, isLoading, error } = useRedesignBooks()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(0)

  if (isLoading || error) return <ScreenFallback error={error} />

  const splitBooks = books.filter((b) => b.split)
  const parts = books.filter((b) => b.part)
  const isEmpty = splitBooks.length === 0 && parts.length === 0

  const totalPages = Math.max(1, Math.ceil(splitBooks.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = splitBooks.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="flex h-full flex-col overflow-auto bg-background px-8 pb-10 pt-[26px]">
      <div className="mb-5 flex items-end gap-3.5">
        <div>
          <div className="mb-1.5 text-2xl font-bold leading-none tracking-[-0.02em]">
            <Trans>Split & merge</Trans>
          </div>
          <div className="max-w-[600px] text-[13.5px] text-muted-foreground">
            <Trans>
              Split a book into page-range parts, export each as a <code>.zip</code> to hand off, then import the returned
              parts and merge them back into the source book.
            </Trans>
          </div>
        </div>
        {!isEmpty && (
          <Button size="sm" className="ml-auto" onClick={() => navigate({ to: "/books/new" })}>
            <Scissors className="size-3.5" />
            <Trans>Split a book</Trans>
          </Button>
        )}
      </div>

      {isEmpty ? (
        <HandoffsEmptyState />
      ) : (
        <>
          {splitBooks.length > 0 && (
            <>
              <div className={`mb-2.5 ${sectionLabel}`}>
                <Trans>Books you&apos;ve split</Trans>
              </div>
              {pageItems.map((b) => (
                <SplitSummaryCard
                  key={b.label}
                  book={b}
                  locale={locale}
                  open={!!open[b.label]}
                  onToggle={() => setOpen((o) => ({ ...o, [b.label]: !o[b.label] }))}
                />
              ))}
              <Pager page={safePage} totalPages={totalPages} totalItems={splitBooks.length} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )}

          {parts.length > 0 && (
            <>
              <div className={`mb-1.5 mt-[26px] ${sectionLabel}`}>
                <Trans>Parts shared with you</Trans>
              </div>
              <div className="mb-3 text-[12.5px] text-muted-foreground">
                <Trans>Parts of other books someone sent you to process. Work through the pages, then export and return the part.</Trans>
              </div>
              {parts.map((b) => (
                <ContributionRow key={b.label} book={b} locale={locale} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
