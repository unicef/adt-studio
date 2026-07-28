import { useAtomValue, useSetAtom } from "jotai"
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react"
import {
  currentSectionIdAtom,
  pagesAtom,
} from "@/features/navigation/state/nav.atoms"
import { getAdjacentPages } from "@/features/navigation/lib/page-navigation"
import { navigateWithPageTurn } from "@/features/kids/lib/kids-page-turn"
import {
  kidsBuddyPanelOpenAtom,
  kidsFinishedAtom,
} from "@/features/kids/state/kids.atoms"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import { cn } from "@/shared/lib/utils"

export function KidsPageArrows() {
  const { tk } = useKidsTranslation()
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const reduceMotion = usePrefersReducedMotion()
  const setFinished = useSetAtom(kidsFinishedAtom)
  const buddyPanelOpen = useAtomValue(kidsBuddyPanelOpenAtom)
  const { prev, next } = getAdjacentPages(pages, currentSectionId)
  // On the final page of a multi-page book the "next" arrow becomes a
  // celebratory finish button that opens the end-of-book screen.
  const atEnd = !next && pages.length > 1

  // The buddy menu can cover the whole screen, and a page arrow floating over
  // it reads as a stray control — hide them while the menu is open.
  if (buddyPanelOpen) return null

  return (
    <>
      {prev ? (
        <KidsArrow
          side="left"
          label={tk("kids-previous-page", "Previous page")}
          reduceMotion={reduceMotion}
          onClick={() => navigateWithPageTurn(prev.href)}
        >
          <ChevronLeft className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
        </KidsArrow>
      ) : null}
      {next ? (
        <KidsArrow
          side="right"
          label={tk("kids-next-page", "Next page")}
          reduceMotion={reduceMotion}
          onClick={() => navigateWithPageTurn(next.href)}
        >
          <ChevronRight className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
        </KidsArrow>
      ) : atEnd ? (
        <KidsArrow
          side="right"
          label={tk("kids-finish-book", "Finish the book")}
          reduceMotion={reduceMotion}
          finish
          onClick={() => setFinished(true)}
        >
          <PartyPopper className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
        </KidsArrow>
      ) : null}
    </>
  )
}

function KidsArrow({
  side,
  label,
  reduceMotion,
  finish = false,
  onClick,
  children,
}: {
  side: "left" | "right"
  label: string
  reduceMotion: boolean
  finish?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={finish ? "kids-finish-book" : `kids-page-arrow-${side}`}
      onClick={onClick}
      className={cn(
        "pointer-events-auto fixed top-1/2 z-[58] flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full",
        "text-white ring-4 ring-white",
        "transition-[transform,box-shadow,background-color] duration-200 ease-out",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FFC800]",
        finish
          ? "bg-[#FFB300] text-slate-950 shadow-[0_5px_0_#C98A00] hover:bg-[#FFC01F]"
          : "bg-sky-600 shadow-[0_5px_0_#075985] hover:bg-sky-500",
        side === "left" ? "left-3" : "right-3",
        !reduceMotion &&
          (finish
            ? "hover:translate-y-[calc(-50%-1px)] hover:shadow-[0_6px_0_#C98A00] active:translate-y-[calc(-50%+4px)] active:shadow-[0_1px_0_#C98A00] kids-buddy-idle"
            : "hover:translate-y-[calc(-50%-1px)] hover:shadow-[0_6px_0_#075985] active:translate-y-[calc(-50%+4px)] active:shadow-[0_1px_0_#075985]"),
      )}
    >
      {children}
    </button>
  )
}
