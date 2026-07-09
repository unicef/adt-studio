import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import {
  buddySpeechAtom,
  kidsBuddyPanelOpenAtom,
} from "@/features/kids/state/kids.atoms"
import { cn } from "@/shared/lib/utils"
import { reduceMotionAtom } from "@/shared/state/ui.atoms"

export function KidsSpeechBubble() {
  const speech = useAtomValue(buddySpeechAtom)
  const panelOpen = useAtomValue(kidsBuddyPanelOpenAtom)
  const reduceMotion = useAtomValue(reduceMotionAtom)
  const [renderedSpeech, setRenderedSpeech] = useState(speech)
  const [visible, setVisible] = useState(Boolean(speech))

  useEffect(() => {
    if (speech) {
      setRenderedSpeech(speech)
      const frame = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }

    setVisible(false)
    const timeout = window.setTimeout(() => setRenderedSpeech(null), 180)
    return () => window.clearTimeout(timeout)
  }, [speech])

  if (panelOpen || !renderedSpeech) return null

  return (
    <div
      data-testid="kids-speech-bubble"
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed right-5",
        "bottom-[7.25rem] z-[58] max-w-[min(18rem,calc(100vw-2.5rem))]",
        "rounded-2xl bg-white px-4 py-3 text-base font-semibold leading-snug text-slate-900",
        "shadow-xl ring-1 ring-black/10",
        reduceMotion
          ? "transition-none"
          : "transition-all duration-[180ms] ease-out",
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "translate-y-2 scale-95 opacity-0",
        "after:absolute after:-bottom-2 after:right-10 after:h-4 after:w-4 after:rotate-45 after:bg-white after:ring-black/10",
      )}
    >
      {renderedSpeech}
    </div>
  )
}
