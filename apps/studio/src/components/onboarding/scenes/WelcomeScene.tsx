import { useEffect, useState } from "react"
import { CornerDownLeft } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { AppPreview } from "../AppPreview"
import type { OnboardingStepProps } from "../steps"

/** Logo lands centered, rises to the top, then the welcome + app preview reveal. */
export function WelcomeScene({ onNext }: OnboardingStepProps) {
  const [mounted, setMounted] = useState(false)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    const timer = setTimeout(() => setRevealed(true), 1050)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-10 pt-3 text-center">
      <img
        aria-hidden
        src="/logo.png"
        alt=""
        width={52}
        height={52}
        className={cn(
          "z-10 rounded-[14px] transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          !mounted && "scale-[0.6] opacity-0",
          mounted && !revealed && "translate-y-[190px] scale-[2] opacity-100",
          revealed && "translate-y-0 scale-100 opacity-100",
        )}
        style={{ boxShadow: "0 16px 40px -12px rgba(59,130,247,.55)" }}
      />

      <h1
        className={cn(
          "mt-3.5 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[#0a0a0a] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
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
          autoFocus
          onClick={onNext}
          className="group inline-flex items-center gap-2 rounded-xl bg-[#3b82f7] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-4px_rgba(59,130,247,0.45)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Trans>Let's start</Trans>
          <CornerDownLeft className="h-4 w-4 text-white/80 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>

      <div
        className={cn(
          "mt-[54px] w-full max-w-[780px] transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "380ms" : "0ms" }}
      >
        <AppPreview />
      </div>
    </div>
  )
}
