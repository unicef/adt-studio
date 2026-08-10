import { useEffect, useRef, useState } from "react"
import { CornerDownLeft } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { AppPreview } from "../AppPreview"
import type { OnboardingStepProps } from "../steps"

/**
 * Plays the rendered logo animation centered, freezes on its final frame (which
 * is the logo), then shrinks/moves it to the top slot and reveals the welcome
 * design + app preview. Reduced-motion skips straight to the resting state.
 */
export function WelcomeScene({ onNext }: OnboardingStepProps) {
  const reduced = prefersReducedMotion()
  const [revealed, setRevealed] = useState(reduced)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (reduced) return
    const v = videoRef.current
    if (v) v.playbackRate = 1.5
    // Fallback in case autoplay is blocked or `ended` never fires.
    const maxTimer = setTimeout(() => setRevealed(true), 6000)
    return () => clearTimeout(maxTimer)
  }, [reduced])

  // Skip the intro: jump the video to its last frame (the logo) and reveal.
  const skipIntro = () => {
    const v = videoRef.current
    if (v && v.duration) {
      try {
        v.currentTime = v.duration
      } catch {
        // seeking unavailable
      }
    }
    setRevealed(true)
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-10 pt-3 text-center">
      {reduced ? (
        <img aria-hidden src="/logo.png" alt="" className="h-14 w-14 object-contain" />
      ) : (
        <video
          ref={videoRef}
          aria-hidden
          src="/onboarding/welcome-logo.mp4"
          poster="/logo.png"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={() => setRevealed(true)}
          onClick={skipIntro}
          className={cn(
            "z-10 h-14 w-14 object-contain transition-all duration-[850ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            revealed
              ? "translate-y-0 scale-100 cursor-default"
              : "translate-y-[232px] scale-[3.7] cursor-pointer",
          )}
        />
      )}

      <h1
        className={cn(
          "mt-3.5 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[#0a0a0a] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "260ms" : "0ms" }}
      >
        <Trans>Welcome to ADT Studio</Trans>
      </h1>

      <p
        className={cn(
          "mt-3.5 max-w-[470px] text-[15px] leading-relaxed text-[#737373] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "340ms" : "0ms" }}
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
