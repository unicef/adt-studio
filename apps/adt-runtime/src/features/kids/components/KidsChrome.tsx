import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import { KidsBuddy } from "@/features/kids/components/KidsBuddy"
import { KidsOnboarding } from "@/features/kids/components/KidsOnboarding"
import { KidsPageArrows } from "@/features/kids/components/KidsPageArrows"
import { KidsSpeechBubble } from "@/features/kids/components/KidsSpeechBubble"
import { isKidsPreviewContext } from "@/features/kids/lib/kids-preview"
import {
  kidsModeActiveAtom,
  kidsOnboardingDoneAtom,
} from "@/features/kids/state/kids.atoms"

// DEV/AUTHORING ONLY — replay onboarding once per browser tab so it is easy to
// review while building. Fires in the same dev/authoring preview context
// used for the kids-mode preview override (see kids-preview.ts):
// NODE_ENV=development or any iframed runtime (the Studio preview always
// runs in an iframe). A shipped book runs standalone (window.parent ===
// window) in production, so this never fires for real readers.
// Guarded by sessionStorage so page turns (each reloads the runtime) don't
// re-trigger it; reopen the tab to see it again.
// Remove before shipping kids mode.
const DEV_ONBOARDING_RESET_KEY = "kidsDevOnboardingReset"

export function KidsChrome() {
  const kidsModeActive = useAtomValue(kidsModeActiveAtom)
  const kidsOnboardingDone = useAtomValue(kidsOnboardingDoneAtom)
  const setKidsOnboardingDone = useSetAtom(kidsOnboardingDoneAtom)

  useEffect(() => {
    if (!isKidsPreviewContext()) return
    if (typeof sessionStorage === "undefined") return
    if (sessionStorage.getItem(DEV_ONBOARDING_RESET_KEY)) return
    sessionStorage.setItem(DEV_ONBOARDING_RESET_KEY, "1")
    setKidsOnboardingDone(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKidsOnboardingDone])

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
          {/* TEMP — quick way to replay onboarding while building. Dev/preview
              only (never in a shipped book). Remove before shipping. */}
          {isKidsPreviewContext() ? (
            <button
              type="button"
              data-testid="kids-redo-onboarding"
              onClick={() => setKidsOnboardingDone(false)}
              className="pointer-events-auto fixed left-4 top-4 z-[60] rounded-full bg-slate-900/80 px-4 py-2 text-sm font-bold text-white shadow-lg ring-1 ring-white/20 transition hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              ↻ Redo intro
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
