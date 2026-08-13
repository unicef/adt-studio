/* eslint-disable lingui/no-unlocalized-strings -- design preview harness */
import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AppSidebar } from "@/components/redesign/AppSidebar"
import { TopBar } from "@/components/title-bar/TopBar"
import { BookDetailDialog } from "@/components/redesign/screens/library/BookDetailDialog"
import type { ReviewComment } from "@/components/redesign/screens/library/CommentsBanner"
import { mockLibrary } from "@/components/redesign/screens/library-full/mock"
import { LibraryView } from "@/components/redesign/screens/library-full/LibraryView"

const REVIEWERS: ReviewComment[] = [
  { author: "Maria Alves", text: "The diagram on page 24 is cut off on the right edge.", page: 24, ago: "2h" },
  { author: "João Pereira", text: "Great chapter intro — can we bold the key term here?", page: 8, ago: "1d" },
  { author: "Sofia Nunes", text: "Quiz question 3 seems to have two correct answers.", page: 51, ago: "3d" },
]
const mockComments = (n: number): ReviewComment[] => Array.from({ length: n }, (_, i) => REVIEWERS[i % REVIEWERS.length])

function Shell({ children, books }: { children: ReactNode; books: number }) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <AppSidebar libraryCount={books} handoffsCount={1} onOpenPalette={() => {}} onOpenAdd={() => {}} onOpenShortcuts={() => {}} />
      <div className="min-h-0 min-w-0 flex-1">
        <div className="relative flex h-full flex-col bg-background pt-8">
          <TopBar className="absolute top-0" />
          <div className="relative min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

function LibraryFullPreview() {
  const navigate = useNavigate()
  const books = useMemo(() => mockLibrary("en"), [])
  const [detailLabel, setDetailLabel] = useState<string | null>(null)
  const found = detailLabel ? books.find((b) => b.label === detailLabel) ?? null : null
  const detail = found && (found.pendingComments ?? 0) > 0 ? { ...found, comments: mockComments(found.pendingComments ?? 0) } : found

  return (
    <div className="h-dvh w-full overflow-hidden">
      <Shell books={books.length}>
        <LibraryView books={books} onOpen={setDetailLabel} onAddBook={() => navigate({ to: "/redesign" })} />
      </Shell>
      <BookDetailDialog
        book={detail}
        onOpenChange={(open) => !open && setDetailLabel(null)}
        onEdit={() => setDetailLabel(null)}
        onDelete={() => setDetailLabel(null)}
        onPublish={() => setDetailLabel(null)}
      />
    </div>
  )
}

export const Route = createFileRoute("/redesign-library-full")({
  component: LibraryFullPreview,
})
