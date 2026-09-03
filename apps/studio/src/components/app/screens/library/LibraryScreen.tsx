import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { TopBar } from "@/components/title-bar/TopBar"
import { toBookVM } from "../../data"
import { ScreenFallback } from "../../ui/ScreenFallback"
import { useAppBooks } from "../../use-app-books"
import { useAppShell } from "../../AppShellContext"
import { BookDetailDialog } from "./BookDetailDialog"
import { LibraryEmptyState } from "./LibraryEmptyState"
import { LibraryView } from "./LibraryView"

export function LibraryScreen() {
  const navigate = useNavigate()
  const { books, locale, isLoading, error } = useAppBooks()
  const { openAdd, requestDelete } = useAppShell()
  const openBook = (label: string) => navigate({ to: "/books/$label/$step", params: { label, step: "book" } })

  const [detailLabel, setDetailLabel] = useState<string | null>(null)

  const vms = useMemo(() => books.map((b) => toBookVM(b, locale)), [books, locale])
  const detail = detailLabel ? vms.find((b) => b.label === detailLabel) ?? null : null

  if (isLoading || error) return <ScreenFallback error={error} />

  return (
    <div className="relative flex h-full flex-col bg-background pt-10">
      <TopBar className="absolute top-0 drag-region" />

      <div className="min-h-0 flex-1 overflow-hidden">
        {books.length === 0 ? (
          <div className="flex h-full flex-col px-[30px] pb-10 pt-1">
            <div className="mb-1.5 text-2xl font-bold leading-none tracking-[-0.02em]">
              <Trans>Library</Trans>
            </div>
            <LibraryEmptyState onOpenAdd={openAdd} />
          </div>
        ) : (
          <LibraryView books={vms} onOpen={setDetailLabel} onAddBook={openAdd} />
        )}
      </div>

      <BookDetailDialog
        book={detail}
        onOpenChange={(o) => !o && setDetailLabel(null)}
        onEdit={openBook}
        onDelete={(label) => requestDelete(label)}
      />
    </div>
  )
}
