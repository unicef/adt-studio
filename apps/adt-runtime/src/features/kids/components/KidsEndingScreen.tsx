import { useAtomValue, useSetAtom } from "jotai"
import { Check, RotateCcw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { getKidsFinishPhrases } from "@adt/types/kids"
import { playActivitySound } from "@/features/activity/runtime/sounds"
import { getBuddyImages } from "@/features/kids/assets/buddy-images"
import { KidsAvatar } from "@/features/kids/components/KidsAvatar"
import { KidsBuddyImage } from "@/features/kids/components/KidsBuddyImage"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import { playBuddyLine, stopBuddyLine } from "@/features/kids/lib/buddy-voice"
import {
  kidsAvatarAtom,
  kidsBuddyAtom,
  kidsFinishedAtom,
  kidsPlayerNameAtom,
} from "@/features/kids/state/kids.atoms"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import { navigateToHref } from "@/features/navigation/lib/page-navigation"
import { pagesAtom } from "@/features/navigation/state/nav.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { Confetti, type ConfettiRef } from "@/shared/ui/confetti"
import { cn } from "@/shared/lib/utils"

/**
 * End-of-book celebration. When the child taps "finish" on the last page the
 * buddy appears beside the child's own avatar, congratulates them by name and
 * (when the book ships a voice pack) out loud, with confetti. The book title is
 * shown on screen — the spoken line stays generic so it works for any book.
 */
export function KidsEndingScreen() {
  const finished = useAtomValue(kidsFinishedAtom)
  const setFinished = useSetAtom(kidsFinishedAtom)
  const buddy = useAtomValue(kidsBuddyAtom)
  const avatar = useAtomValue(kidsAvatarAtom)
  const playerName = useAtomValue(kidsPlayerNameAtom).trim()
  const language = useAtomValue(currentLanguageAtom)
  const pages = useAtomValue(pagesAtom)
  const config = useAtomValue(appConfigAtom)
  const { tk } = useKidsTranslation()
  const reduceMotion = usePrefersReducedMotion()

  const confettiRef = useRef<ConfettiRef>(null)
  const [spoken, setSpoken] = useState("")

  useEffect(() => {
    if (!finished) return
    const pool = getKidsFinishPhrases(buddy.character)
    const line = pool[Math.floor(Math.random() * pool.length)]
    setSpoken(tk(line.key, line.fallback, { name: playerName }))
    playActivitySound("finish")
    void playBuddyLine(language, buddy.character, line.voiceKey ?? line.key)
    if (!reduceMotion) {
      const burst = () =>
        confettiRef.current?.fire({
          particleCount: 140,
          spread: 100,
          startVelocity: 48,
          origin: { x: 0.5, y: 0.75 },
        })
      burst()
      const again = window.setTimeout(burst, 700)
      return () => window.clearTimeout(again)
    }
  }, [finished, buddy.character, language, playerName, reduceMotion, tk])

  if (!finished) return null

  const title = config.title?.trim()
  const heading = title
    ? tk("kids-finish-heading", "You finished ${book}!", { book: title })
    : tk("kids-finish-heading-generic", "You finished the book!")

  const close = () => {
    stopBuddyLine()
    setFinished(false)
  }
  const readAgain = () => {
    stopBuddyLine()
    setFinished(false)
    if (pages.length > 0) navigateToHref(pages[0].href)
  }

  return (
    <div
      data-testid="kids-ending-screen"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="pointer-events-auto fixed inset-0 z-[64] overflow-y-auto text-slate-950"
      style={{
        background:
          "linear-gradient(180deg, rgb(201, 230, 249) 0%, rgb(165, 210, 240) 100%)",
      }}
    >
      {!reduceMotion ? (
        <Confetti
          ref={confettiRef}
          manualstart
          className="pointer-events-none fixed inset-0 z-[1] h-full w-full"
        />
      ) : null}

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-7 px-6 py-12 text-center">
        <div className="flex items-end justify-center gap-3">
          <KidsBuddyImage
            images={getBuddyImages(buddy.character)}
            variant="excited"
            className="h-40 w-40 drop-shadow-xl sm:h-48 sm:w-48"
            animate={!reduceMotion}
          />
          <KidsAvatar
            config={avatar}
            size={112}
            className="shadow-[0_6px_0_#C4DFF2] ring-4 ring-white"
          />
        </div>

        <h1 className="max-w-2xl text-balance text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
          {heading}
        </h1>

        {spoken ? (
          <p className="max-w-xl text-balance text-2xl font-bold leading-snug text-sky-900">
            {spoken}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-testid="kids-ending-again"
            onClick={readAgain}
            className={cn(
              "inline-flex min-h-14 items-center gap-2 rounded-full bg-white px-6 text-lg font-extrabold text-sky-800 shadow-[0_4px_0_#B7D6EC] ring-2 ring-sky-100",
              "transition-all duration-150 hover:bg-sky-50 active:translate-y-[2px] active:shadow-[0_1px_0_#B7D6EC]",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
            )}
          >
            <RotateCcw className="h-6 w-6" aria-hidden="true" />
            {tk("kids-finish-again", "Read it again")}
          </button>
          <button
            type="button"
            data-testid="kids-ending-done"
            onClick={close}
            className={cn(
              "inline-flex min-h-14 items-center gap-2 rounded-full bg-[#FFC800] px-7 text-lg font-black text-slate-950 shadow-[0_5px_0_#DFA000]",
              "transition-all duration-150 hover:bg-[#FFD21F] active:translate-y-[3px] active:shadow-[0_1px_0_#DFA000]",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
            )}
          >
            <Check className="h-6 w-6" aria-hidden="true" />
            {tk("kids-finish-done", "All done!")}
          </button>
        </div>
      </div>
    </div>
  )
}
