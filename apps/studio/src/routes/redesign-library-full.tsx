import type { ReactNode } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AppSidebar } from "@/components/redesign/AppSidebar"
import { TopBar } from "@/components/title-bar/TopBar"
import { mockLibrary } from "@/components/redesign/screens/library-full/mock"
import { LibraryView } from "@/components/redesign/screens/library-full/LibraryView"

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
  const books = mockLibrary("en")
  return (
    <div className="h-dvh w-full overflow-hidden">
      <Shell books={books.length}>
        <LibraryView books={books} onOpen={() => {}} onAddBook={() => navigate({ to: "/redesign" })} />
      </Shell>
    </div>
  )
}

export const Route = createFileRoute("/redesign-library-full")({
  component: LibraryFullPreview,
})
