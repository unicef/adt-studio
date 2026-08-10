import { useEffect, useState } from "react"
import { CornerDownLeft, FlaskConical } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { AppPreview } from "../AppPreview"
import { OB_LOGO_SRC } from "../theme"
import type { OnboardingStepProps } from "../steps"

/**
 * Opens with the beta app icon large and centered, then shrinks/moves it to the
 * top slot and reveals the welcome design + app preview. Reduced-motion skips
 * straight to the resting state, and a click skips the intro.
 */
export function WelcomeScene({ onNext }: OnboardingStepProps) {
  const reduced = prefersReducedMotion()
  const [revealed, setRevealed] = useState(reduced)

  useEffect(() => {
    if (reduced) return
    const timer = setTimeout(() => setRevealed(true), 1150)
    return () => clearTimeout(timer)
  }, [reduced])

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-10 pt-3 text-center">
      <img
        aria-hidden
        src={OB_LOGO_SRC}
        alt=""
        onClick={() => setRevealed(true)}
        className={cn(
          "z-10 h-14 w-14 rounded-[22%] object-contain transition-all duration-[850ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed
            ? "translate-y-0 scale-100 cursor-default"
            : "translate-y-[232px] scale-[3.7] cursor-pointer drop-shadow-[0_18px_50px_rgba(var(--ob-accent-rgb),0.5)]",
        )}
      />

      <span
        className={cn(
          "mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--ob-accent-tint)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ob-accent-strong)] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "220ms" : "0ms" }}
      >
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={2.4} />
        <Trans>Beta preview</Trans>
      </span>

      <h1
        className={cn(
          "mt-3 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[#0a0a0a] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "300ms" : "0ms" }}
      >
        <Trans>Welcome to the ADT Studio beta</Trans>
      </h1>

      <p
        className={cn(
          "mt-3.5 max-w-[470px] text-[15px] leading-relaxed text-[#737373] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "380ms" : "0ms" }}
      >
        <Trans>
          You're one of the first to try it. Turn any textbook into an
          accessible edition — every step of the pipeline, built in.
        </Trans>
      </p>

      <div
        className={cn(
          "mt-3.5 transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "420ms" : "0ms" }}
      >
        <button
          type="button"
          onClick={onNext}
          className="group inline-flex items-center gap-2 rounded-xl bg-[var(--ob-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-4px_rgba(var(--ob-accent-rgb),0.45)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
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
        style={{ transitionDelay: revealed ? "520ms" : "0ms" }}
      >
        <AppPreview />
      </div>
    </div>
  )
}
