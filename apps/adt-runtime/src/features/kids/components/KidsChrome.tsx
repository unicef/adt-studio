import { useAtomValue } from "jotai"
import { KidsBuddy } from "@/features/kids/components/KidsBuddy"
import { KidsPageArrows } from "@/features/kids/components/KidsPageArrows"
import { KidsSpeechBubble } from "@/features/kids/components/KidsSpeechBubble"
import { kidsModeActiveAtom } from "@/features/kids/state/kids.atoms"

export function KidsChrome() {
  const kidsModeActive = useAtomValue(kidsModeActiveAtom)

  return (
    <div
      data-testid="kids-chrome"
      className="pointer-events-none fixed inset-0 z-[55]"
      aria-hidden={kidsModeActive ? undefined : "true"}
    >
      {kidsModeActive ? (
        <>
          <KidsPageArrows />
          <KidsSpeechBubble />
          <KidsBuddy />
        </>
      ) : null}
    </div>
  )
}
