import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import {
  getKidsCelebratePhrases,
  getKidsEncouragePhrases,
  type KidsBuddyLine,
} from "@adt/types/kids"
import { activityResultAtom } from "@/features/activity/state/activity.atoms"
import { getBuddyImages } from "@/features/kids/assets/buddy-images"
import { KidsAvatar } from "@/features/kids/components/KidsAvatar"
import { KidsBuddyImage } from "@/features/kids/components/KidsBuddyImage"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import { playBuddyLine } from "@/features/kids/lib/buddy-voice"
import {
  kidsAvatarAtom,
  kidsBuddyAtom,
  kidsPlayerNameAtom,
} from "@/features/kids/state/kids.atoms"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import { cn } from "@/shared/lib/utils"

const VISIBLE_MS = 4500

function pickLine(
  pool: readonly KidsBuddyLine[],
  hasName: boolean,
): KidsBuddyLine {
  // Avoid awkward "…, !" when the child hasn't given a name.
  const usable = hasName
    ? pool
    : pool.filter((l) => !l.fallback.includes("${name}"))
  const from = usable.length > 0 ? usable : pool
  return from[Math.floor(Math.random() * from.length)]
}

/**
 * When the child submits a quiz/activity, the buddy pops up next to the child's
 * own avatar with a short spoken reaction — celebrating a correct answer or
 * gently encouraging after a wrong one. Purely decorative: never blocks input,
 * auto-dismisses, and stays silent for books without a voice pack.
 */
export function KidsActivityReaction() {
  const result = useAtomValue(activityResultAtom)
  const buddy = useAtomValue(kidsBuddyAtom)
  const avatar = useAtomValue(kidsAvatarAtom)
  const playerName = useAtomValue(kidsPlayerNameAtom).trim()
  const language = useAtomValue(currentLanguageAtom)
  const { tk } = useKidsTranslation()
  const reduceMotion = usePrefersReducedMotion()

  const [shown, setShown] = useState<{ correct: boolean; text: string } | null>(
    null,
  )
  const lastToken = useRef(result.token)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (result.token === 0 || result.token === lastToken.current) return
    lastToken.current = result.token

    const pool = result.correct
      ? getKidsCelebratePhrases(buddy.character)
      : getKidsEncouragePhrases(buddy.character)
    const line = pickLine(pool, playerName.length > 0)
    setShown({
      correct: result.correct,
      text: tk(line.key, line.fallback, { name: playerName }),
    })
    void playBuddyLine(language, buddy.character, line.voiceKey ?? line.key)

    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setShown(null), VISIBLE_MS)
  }, [result.token, result.correct, buddy.character, language, playerName, tk])

  useEffect(
    () => () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  if (!shown) return null

  return (
    <div
      data-testid="kids-activity-reaction"
      className="pointer-events-none fixed inset-x-0 top-6 z-[62] flex justify-center px-4"
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-3 rounded-[2rem] bg-white/95 p-3 pr-5 shadow-2xl ring-2 backdrop-blur-sm",
          shown.correct ? "ring-emerald-200" : "ring-sky-200",
          !reduceMotion && "animate-kidsPanelOpen",
        )}
      >
        <KidsBuddyImage
          images={getBuddyImages(buddy.character)}
          variant={shown.correct ? "excited" : "encouraging"}
          className="h-20 w-20 shrink-0"
          animate={!reduceMotion}
        />
        <p className="max-w-[15rem] text-balance text-xl font-black leading-tight text-slate-900">
          {shown.text}
        </p>
        <KidsAvatar
          config={avatar}
          size={56}
          className="shrink-0 shadow-[0_2px_0_#C4DFF2] ring-2 ring-white"
        />
      </div>
    </div>
  )
}
