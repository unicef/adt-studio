import { useAtomValue } from "jotai"
import { KidsBuddy } from "@/features/kids/components/KidsBuddy"
import { KidsOnboarding } from "@/features/kids/components/KidsOnboarding"
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
          <KidsPageArrows />
          <KidsSpeechBubble />
          <KidsBuddy />
        </>
      ) : null}
    </div>
  )
}
