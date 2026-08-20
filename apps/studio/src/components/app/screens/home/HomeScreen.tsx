import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { WelcomeHero } from "./WelcomeHero"
import { WelcomeFeatures } from "./WelcomeFeatures"
import { HomeHeroAnchor } from "./HomeHeroAnchor"
import { BookDetailDialog } from "../library/BookDetailDialog"
import { ScreenFallback } from "../../ui/ScreenFallback"
import { toBookVM } from "../../data"
import { APP_PATHS } from "../../nav"
import { useAppBooks } from "../../use-app-books"
import { useAppShell } from "../../AppShellContext"
import { TopBar } from "@/components/title-bar/TopBar"

export function HomeScreen() {
  const navigate = useNavigate()
  const { books, locale, isLoading, error } = useAppBooks()
  const { openAdd, requestDelete } = useAppShell()
  const openBook = (label: string) => navigate({ to: "/books/$label/$step", params: { label, step: "book" } })

  const [detailLabel, setDetailLabel] = useState<string | null>(null)

  const vms = useMemo(() => {
    const sorted = [...books].sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    return sorted.map((b) => toBookVM(b, locale))
  }, [books, locale])

  const detail = detailLabel ? vms.find((b) => b.label === detailLabel) ?? null : null

  if (isLoading || error) return <ScreenFallback error={error} />

  const hasBooks = vms.length > 0

  return (
    <div className="relative flex h-full flex-col bg-background">
      <TopBar className="absolute top-0 drag-region" />
      <div className="pointer-events-none absolute -top-[120px] right-[-80px] size-[440px] animate-hero-drift rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.12),transparent_70%)]" />

      {hasBooks ? (
        <div className="relative min-h-0 flex-1">
          <HomeHeroAnchor
            books={vms}
            onOpen={setDetailLabel}
            onContinue={openBook}
            onAddBook={openAdd}
            onOpenLibrary={() => navigate({ to: APP_PATHS.library })}
          />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-auto px-11 py-12">
          <div className="m-auto w-full">
            <WelcomeHero onOpenAdd={openAdd} />
            <WelcomeFeatures />
          </div>
        </div>
      )}

      <BookDetailDialog
        book={detail}
        onOpenChange={(o) => !o && setDetailLabel(null)}
        onEdit={openBook}
        onDelete={(label) => requestDelete(label)}
      />
    </div>
  )
}
