import { useEffect, useRef, useState } from "react"
import { CornerDownLeft, FlaskConical } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { AppPreview } from "../AppPreview"
import { OB_LOGO_SRC, OB_IS_BETA } from "../theme"
import type { OnboardingStepProps } from "../steps"

/**
 * Opens with the brand mark large and centered, then shrinks/moves it to the top
 * slot and reveals the welcome design + app preview. On stable the mark is the
 * rendered 3D logo video that resolves into the app icon; on beta it's the beta
 * icon (whose color the video doesn't match). Reduced-motion skips straight to
 * the resting state, and a click skips the intro.
 */
export function WelcomeScene({ onNext }: OnboardingStepProps) {
  const reduced = prefersReducedMotion()
  const [revealed, setRevealed] = useState(reduced)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (reduced) return
    // Beta shows the static icon on a short timer; stable lets the intro video
    // drive the reveal (with a fallback in case `ended` never fires).
    const timer = setTimeout(() => setRevealed(true), OB_IS_BETA ? 1150 : 6000)
    return () => clearTimeout(timer)
  }, [reduced])

  // The static app icon is the mark; on stable the intro video plays over it and
  // fades out on reveal, so the resting icon is always the crisp icon (never the
  // video's white-margined final frame).
  const markShift = cn(
    "relative z-10 h-14 w-14 transition-all duration-[850ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
    revealed
      ? "translate-y-0 scale-100 cursor-default drop-shadow-[0_10px_24px_-10px_rgba(var(--ob-accent-rgb),0.45)]"
      : "translate-y-[232px] scale-[3.7] cursor-pointer drop-shadow-[0_18px_50px_rgba(var(--ob-accent-rgb),0.5)]",
  )

  const skipIntro = () => {
    const v = videoRef.current
    if (v && Number.isFinite(v.duration)) v.currentTime = v.duration
    setRevealed(true)
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-10 pt-3 text-center">
      <div className={markShift} onClick={skipIntro}>
        <img
          aria-hidden
          src={OB_LOGO_SRC}
          alt=""
          className="h-14 w-14 rounded-[22%] object-contain"
        />
        {!OB_IS_BETA && (
          <video
            ref={videoRef}
            aria-hidden
            poster="/logo.png"
            muted
            playsInline
            autoPlay
            onEnded={() => setRevealed(true)}
            className={cn(
              "absolute inset-0 h-14 w-14 rounded-[22%] object-contain transition-opacity duration-500",
              revealed ? "opacity-0" : "opacity-100",
            )}
          >
            {/* Alpha WebM (transparent, works on any theme) is preferred when present;
                falls back to the white-background MP4 until a 3D alpha render lands. */}
            <source src="/onboarding/welcome-logo.webm" type="video/webm" />
            <source src="/onboarding/welcome-logo.mp4" type="video/mp4" />
          </video>
        )}
      </div>

      {OB_IS_BETA && (
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
      )}

      <h1
        className={cn(
          "mt-3 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ob-fg)] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "300ms" : "0ms" }}
      >
        {OB_IS_BETA ? (
          <Trans>Welcome to the ADT Studio beta</Trans>
        ) : (
          <Trans>Welcome to ADT Studio</Trans>
        )}
      </h1>

      <p
        className={cn(
          "mt-3.5 max-w-[470px] text-[15px] leading-relaxed text-[var(--ob-muted)] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "380ms" : "0ms" }}
      >
        {OB_IS_BETA ? (
          <Trans>
            You're one of the first to try it. Turn any textbook into an
            accessible edition — every step of the pipeline, built in.
          </Trans>
        ) : (
          <Trans>
            Turn any textbook into an accessible edition — every step of the
            pipeline, built in.
          </Trans>
        )}
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
