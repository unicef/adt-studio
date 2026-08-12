import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { WelcomeHero } from "./home/WelcomeHero"
import { FeatureTour } from "./home/FeatureTour"
import { HomeHeroAnchor } from "./home/home-full/HomeHeroAnchor"
import { ScreenFallback } from "../ui/ScreenFallback"
import { toBookVM } from "../data"
import { REDESIGN_PATHS } from "../nav"
import { useRedesignBooks } from "../use-redesign-books"
import { useRedesignShell } from "../RedesignShellContext"
import { TopBar } from "@/components/title-bar/TopBar"

export function HomeScreen() {
  const navigate = useNavigate()
  const { books, locale, isLoading, error } = useRedesignBooks()
  const { openAdd } = useRedesignShell()
  const openBook = (label: string) => navigate({ to: "/books/$label/$step", params: { label, step: "book" } })

  const vms = useMemo(() => {
    const sorted = [...books].sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    return sorted.map((b) => toBookVM(b, locale))
  }, [books, locale])

  if (isLoading || error) return <ScreenFallback error={error} />

  const hasBooks = vms.length > 0

  return (
    <div className="relative flex h-full flex-col bg-background pt-8">
      <TopBar className="absolute top-0 drag-region" />
      <div className="pointer-events-none absolute -top-[120px] right-[-80px] size-[440px] animate-hero-drift rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.12),transparent_70%)]" />

      {hasBooks ? (
        <div className="relative min-h-0 flex-1">
          <HomeHeroAnchor
            books={vms}
            onOpen={openBook}
            onAddBook={openAdd}
            onOpenLibrary={() => navigate({ to: REDESIGN_PATHS.library })}
          />
        </div>
      ) : (
        <div className="relative px-8 pb-6">
          <WelcomeHero onOpenAdd={openAdd} />
          <FeatureTour />
        </div>
      )}
    </div>
  )
}
