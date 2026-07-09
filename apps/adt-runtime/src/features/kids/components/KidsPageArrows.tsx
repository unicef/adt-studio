import { useAtomValue } from "jotai"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  currentSectionIdAtom,
  pagesAtom,
} from "@/features/navigation/state/nav.atoms"
import {
  getAdjacentPages,
  navigateToHref,
} from "@/features/navigation/lib/page-navigation"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { cn } from "@/shared/lib/utils"
import { reduceMotionAtom } from "@/shared/state/ui.atoms"

export function KidsPageArrows() {
  const { tk } = useKidsTranslation()
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const reduceMotion = useAtomValue(reduceMotionAtom)
  const { prev, next } = getAdjacentPages(pages, currentSectionId)

  return (
    <>
      {prev ? (
        <KidsArrow
          side="left"
          label={tk("kids-previous-page", "Previous page")}
          reduceMotion={reduceMotion}
          onClick={() => navigateToHref(prev.href)}
        >
          <ChevronLeft className="h-10 w-10" aria-hidden="true" />
        </KidsArrow>
      ) : null}
      {next ? (
        <KidsArrow
          side="right"
          label={tk("kids-next-page", "Next page")}
          reduceMotion={reduceMotion}
          onClick={() => navigateToHref(next.href)}
        >
          <ChevronRight className="h-10 w-10" aria-hidden="true" />
        </KidsArrow>
      ) : null}
    </>
  )
}

function KidsArrow({
  side,
  label,
  reduceMotion,
  onClick,
  children,
}: {
  side: "left" | "right"
  label: string
  reduceMotion: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={`kids-page-arrow-${side}`}
      onClick={onClick}
      className={cn(
        "pointer-events-auto fixed top-1/2 z-[58] flex h-20 w-16 -translate-y-1/2 items-center justify-center",
        "bg-white/95 text-slate-900 shadow-xl ring-2 ring-amber-200/80 backdrop-blur",
        "transition-all duration-200 ease-out active:scale-95",
        "hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400",
        side === "left"
          ? "left-0 rounded-r-[2rem] pl-1"
          : "right-0 rounded-l-[2rem] pr-1",
        !reduceMotion && "hover:w-20",
      )}
    >
      {children}
    </button>
  )
}
