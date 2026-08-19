import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TopBar } from "@/components/title-bar/TopBar"
import { ScreenFallback } from "../../ui/ScreenFallback"
import { useAppBooks } from "../../use-app-books"
import { HandoffsEmptyState } from "./HandoffsEmptyState"
import { SplitMasterDetail } from "./SplitMasterDetail"
import { ContributionRow } from "./ContributionRow"
import { CoordinatorEmpty, EditorEmpty } from "./HandoffsEmpties"

const sectionLabel = "text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground"

export function HandoffsScreen() {
  const navigate = useNavigate()
  const { books, locale, isLoading, error } = useAppBooks()

  if (isLoading || error) return <ScreenFallback error={error} />

  const splitBooks = books.filter((b) => b.split)
  const parts = books.filter((b) => b.part)
  const firstRun = splitBooks.length === 0 && parts.length === 0

  return (
    <div className="relative flex h-full flex-col bg-background pt-8">
      <TopBar className="absolute top-0 drag-region" />

      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-8 pb-10">
        <div className="mb-5 flex items-end gap-3.5">
          <div>
            <div className="mb-1.5 text-2xl font-bold leading-none tracking-[-0.02em]">
              <Trans>Split & merge</Trans>
            </div>
            <div className="max-w-[620px] text-[13.5px] text-muted-foreground">
              <Trans>
                Split a book into page-range parts to process on lighter machines or share with collaborators. Work a part
                here, or export it as a <code>.zip</code> — then merge every part back into the source book.
              </Trans>
            </div>
          </div>
          {!firstRun && (
            <Button size="sm" className="ml-auto" onClick={() => navigate({ to: "/books/new" })}>
              <Scissors className="size-3.5" />
              <Trans>Split a book</Trans>
            </Button>
          )}
        </div>

        {firstRun ? (
          <HandoffsEmptyState />
        ) : (
          <>
            <div className={`mb-2.5 ${sectionLabel}`}>
              <Trans>Books you&apos;ve split</Trans>
            </div>
            {splitBooks.length > 0 ? <SplitMasterDetail books={splitBooks} locale={locale} /> : <CoordinatorEmpty />}

            <div className={`mb-1 mt-8 ${sectionLabel}`}>
              <Trans>Parts shared with you</Trans>
            </div>
            <div className="mb-3 text-[12.5px] text-muted-foreground">
              <Trans>Parts of other books someone sent you to process. Work through the pages, then export and return the part.</Trans>
            </div>
            {parts.length > 0 ? parts.map((b) => <ContributionRow key={b.label} book={b} locale={locale} />) : <EditorEmpty />}
          </>
        )}
      </div>
    </div>
  )
}
