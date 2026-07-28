import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { preloadSound } from "@/features/activity/runtime/sounds"
import { KidsActivityReaction } from "@/features/kids/components/KidsActivityReaction"
import { KidsBuddy } from "@/features/kids/components/KidsBuddy"
import { KidsEndingScreen } from "@/features/kids/components/KidsEndingScreen"
import { KidsOnboarding } from "@/features/kids/components/KidsOnboarding"
import { KidsMenuVariantSwitch } from "@/features/kids/components/menu/KidsMenuVariantSwitch"
import { KidsPageArrows } from "@/features/kids/components/KidsPageArrows"
import { KidsSpeechBubble } from "@/features/kids/components/KidsSpeechBubble"
import { useKidsReadingComfort } from "@/features/kids/hooks/useKidsReadingComfort"
import {
  kidsModeActiveAtom,
  kidsOnboardingDoneAtom,
} from "@/features/kids/state/kids.atoms"

export function KidsChrome() {
  const kidsModeActive = useAtomValue(kidsModeActiveAtom)
  const kidsOnboardingDone = useAtomValue(kidsOnboardingDoneAtom)

  useKidsReadingComfort(kidsModeActive)

  // The page-turn cue is seeked past its quiet build, which needs metadata
  // loaded — fetch it up front so the very first turn is audible.
  useEffect(() => {
    if (kidsModeActive) preloadSound("page_turn")
  }, [kidsModeActive])

  return (
    <div
      data-testid="kids-chrome"
      className="pointer-events-none fixed inset-0 z-[55]"
      aria-hidden={kidsModeActive ? undefined : "true"}
    >
      {kidsModeActive && !kidsOnboardingDone ? (
        <KidsOnboarding />
      ) : kidsModeActive ? (
        <>
          <KidsMenuVariantSwitch />
          <KidsPageArrows />
          <KidsSpeechBubble />
          <KidsActivityReaction />
          <KidsBuddy />
          <KidsEndingScreen />
        </>
      ) : null}
    </div>
  )
}
