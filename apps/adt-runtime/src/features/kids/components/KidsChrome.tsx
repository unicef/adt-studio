import { useAtomValue } from "jotai"
import { KidsBuddy } from "@/features/kids/components/KidsBuddy"
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
          <KidsSpeechBubble />
          <KidsBuddy />
        </>
      ) : null}
    </div>
  )
}
