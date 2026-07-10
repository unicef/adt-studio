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
          <ChevronLeft className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
        </KidsArrow>
      ) : null}
      {next ? (
        <KidsArrow
          side="right"
          label={tk("kids-next-page", "Next page")}
          reduceMotion={reduceMotion}
          onClick={() => navigateToHref(next.href)}
        >
          <ChevronRight className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
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
        "pointer-events-auto fixed top-1/2 z-[58] flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full",
        "bg-sky-500 text-white shadow-[0_5px_0_#075985] ring-4 ring-white",
        "transition-[transform,box-shadow,background-color] duration-200 ease-out",
        "hover:bg-sky-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FFC800]",
        side === "left" ? "left-3" : "right-3",
        !reduceMotion &&
          "hover:translate-y-[calc(-50%-1px)] hover:shadow-[0_6px_0_#075985] active:translate-y-[calc(-50%+4px)] active:shadow-[0_1px_0_#075985]",
      )}
    >
      {children}
    </button>
  )
}
