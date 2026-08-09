import { useEffect, useState } from "react"
import { CornerDownLeft } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { AppPreview } from "../AppPreview"
import type { OnboardingStepProps } from "../steps"

/** Rendered logo animation (tablet powers on → book opens) plays, then the welcome reveals. */
export function WelcomeScene({ onNext }: OnboardingStepProps) {
  const [revealed, setRevealed] = useState(false)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), reduced ? 0 : 900)
    return () => clearTimeout(timer)
  }, [reduced])

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-10 pt-2 text-center">
      {reduced ? (
        <img aria-hidden src="/logo.png" alt="" className="mt-3 h-[120px] w-[120px] object-contain" />
      ) : (
        <video
          aria-hidden
          src="/onboarding/welcome-logo.mp4"
          poster="/logo.png"
          autoPlay
          muted
          playsInline
          preload="auto"
          className="z-10 h-[200px] w-[200px] object-contain"
        />
      )}

      <h1
        className={cn(
          "mt-1 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[#0a0a0a] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "100ms" : "0ms" }}
      >
        <Trans>Welcome to ADT Studio</Trans>
      </h1>

      <p
        className={cn(
          "mt-3.5 max-w-[470px] text-[15px] leading-relaxed text-[#737373] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "180ms" : "0ms" }}
      >
        <Trans>
          Turn any textbook into an accessible edition — every step of the
          pipeline, built in.
        </Trans>
      </p>

      <div
        className={cn(
          "mt-3.5 transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "260ms" : "0ms" }}
      >
        <button
          type="button"
          onClick={onNext}
          className="group inline-flex items-center gap-2 rounded-xl bg-[#3b82f7] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-4px_rgba(59,130,247,0.45)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Trans>Let's start</Trans>
          <CornerDownLeft className="h-4 w-4 text-white/80 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>

      <div
        className={cn(
          "mt-8 w-full max-w-[780px] transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "380ms" : "0ms" }}
      >
        <AppPreview />
      </div>
    </div>
  )
}
