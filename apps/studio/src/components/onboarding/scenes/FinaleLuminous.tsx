import { ArrowRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { OnboardingStepProps } from "../steps"

/** Soft brand-tinted aurora blob (low opacity) for the light canvas. */
function Blob({ className, delay = 0 }: { className: string; delay?: number }) {
  return (
    <div
      aria-hidden
      className={`animate-finale-aurora pointer-events-none absolute rounded-full blur-3xl ${className}`}
      style={{ animationDelay: `${delay}s` }}
    />
  )
}

/**
 * Finale A — "Luminous" (light, consistent with the onboarding flow).
 * Exaggerated-minimal: oversized confident type on warm white, one blue accent,
 * a soft feature-colored aurora, and a single masked line-rise reveal.
 */
export function FinaleLuminous({ onSkip }: OnboardingStepProps) {
  return (
    <div className="relative flex h-full w-full flex-col justify-center overflow-hidden bg-[#fbfcff] pl-14 pr-12">
      {/* soft feature-colored aurora */}
      <Blob className="-left-24 -top-16 h-80 w-80 bg-[#3b82f7]/18" />
      <Blob className="right-[-10%] top-[-12%] h-72 w-72 bg-[#db2777]/12" delay={-6} />
      <Blob className="bottom-[-18%] left-1/3 h-80 w-80 bg-[#65a30d]/12" delay={-11} />
      <Blob className="bottom-[-10%] right-[6%] h-64 w-64 bg-[#ea580c]/10" delay={-3} />

      <div className="relative max-w-[620px]">
        <div className="animate-onboarding-fade-up mb-7 flex items-center gap-2 [animation-delay:40ms]">
          <img src="/logo.png" alt="" aria-hidden className="h-9 w-9 object-contain" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b7688]">
            <Trans>Built for every reader</Trans>
          </span>
        </div>

        <h2 className="text-[64px] font-semibold leading-[0.98] tracking-[-0.035em] text-[#0a0f1e]">
          <span className="block overflow-hidden pb-[0.08em]">
            <span className="animate-finale-rise inline-block [animation-delay:140ms]">
              <Trans>Reading,</Trans>
            </span>
          </span>
          <span className="block overflow-hidden pb-[0.08em]">
            <span className="animate-finale-rise inline-block [animation-delay:250ms]">
              <Trans>for</Trans> <span className="text-[#2563eb]"><Trans>everyone.</Trans></span>
            </span>
          </span>
        </h2>

        <p className="animate-onboarding-fade-up mt-6 max-w-[440px] text-[17px] leading-relaxed text-[#4a5568] [animation-delay:520ms]">
          <Trans>
            Speech, translations, quizzes and a glossary — built into every book,
            so every learner can read, listen and understand.
          </Trans>
        </p>

        <div className="animate-onboarding-fade-up mt-9 flex items-center gap-5 [animation-delay:660ms]">
          <button
            type="button"
            onClick={onSkip}
            className="group inline-flex items-center gap-2.5 rounded-2xl bg-[#2563eb] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_34px_-10px_rgba(37,99,235,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1d4ed8] active:translate-y-0 cursor-pointer"
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
            className="text-[14px] font-medium text-[#8a93a6] transition-colors hover:text-[#0a0f1e] cursor-pointer"
          >
            <Trans>Explore a sample</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}
