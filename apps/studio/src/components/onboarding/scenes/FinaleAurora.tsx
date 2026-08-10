import { ArrowRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { OnboardingStepProps } from "../steps"

/** Luminous feature-colored aurora blob for the dark canvas (screen-blended). */
function Blob({ className, delay = 0 }: { className: string; delay?: number }) {
  return (
    <div
      aria-hidden
      className={`animate-finale-aurora pointer-events-none absolute rounded-full mix-blend-screen blur-[90px] ${className}`}
      style={{ animationDelay: `${delay}s` }}
    />
  )
}

/**
 * Finale B — "Aurora" (dark, cinematic — one designed frame, no screenshot).
 * A deep field with the four reader-feature hues + accessibility blue woven into
 * a slow-flowing aurora, oversized type, a masked line-rise reveal, one CTA.
 */
export function FinaleAurora({ onSkip }: OnboardingStepProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#070b18] text-center">
      {/* flowing feature-colored aurora */}
      <Blob className="left-[8%] top-[6%] h-80 w-80 bg-[#3b82f7]/55" />
      <Blob className="right-[6%] top-[10%] h-72 w-72 bg-[#db2777]/40" delay={-7} />
      <Blob className="bottom-[2%] left-[26%] h-96 w-96 bg-[#65a30d]/32" delay={-13} />
      <Blob className="bottom-[8%] right-[16%] h-72 w-72 bg-[#ea580c]/30" delay={-4} />
      <Blob className="left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 bg-[#e11d48]/22" delay={-9} />

      {/* legibility vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 30%, rgba(6,9,20,0.72) 100%)" }}
      />

      <div className="relative flex flex-col items-center px-10">
        <span className="animate-onboarding-fade-up mb-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9db4e8] [animation-delay:40ms]">
          <Trans>Built for every reader</Trans>
        </span>

        <h2 className="text-[62px] font-semibold leading-[0.98] tracking-[-0.035em] text-white">
          <span className="block overflow-hidden pb-[0.08em]">
            <span className="animate-finale-rise inline-block [animation-delay:150ms]">
              <Trans>Reading, for</Trans>
            </span>
          </span>
          <span className="block overflow-hidden pb-[0.12em]">
            <span className="animate-finale-rise inline-block bg-[linear-gradient(100deg,#8ab4ff,#7ef0c4,#8ab4ff)] bg-clip-text text-transparent [animation-delay:270ms]">
              <Trans>everyone.</Trans>
            </span>
          </span>
        </h2>

        <p className="animate-onboarding-fade-up mt-6 max-w-[460px] text-[16px] leading-relaxed text-[#b6c0d6] [animation-delay:560ms]">
          <Trans>
            Speech, translations, quizzes and a glossary — built into every book,
            so every learner can read, listen and understand.
          </Trans>
        </p>

        <div className="animate-onboarding-fade-up mt-9 flex flex-col items-center gap-3.5 [animation-delay:700ms]">
          <button
            type="button"
            onClick={onSkip}
            className="group inline-flex items-center gap-2.5 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-semibold text-[#0a0f1e] shadow-[0_16px_44px_-10px_rgba(120,160,255,0.5)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Trans>Go to Home</Trans>
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2.4}
            />
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] font-medium text-[#8b96ad] transition-colors hover:text-white cursor-pointer"
          >
            <Trans>Explore a sample</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}
