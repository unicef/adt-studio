import { ArrowRight, Accessibility } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { OnboardingStepProps } from "../steps"

/** Warm, animated close: a note on accessibility — reading for everyone. */
export function FinaleScene({ onFinish, onSkip }: OnboardingStepProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-10 text-center">
      {/* soft aurora — ambient, drifting */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_-10%,#eaf3ff_0%,#ffffff_55%,#eafbf1_100%)]" />
      <div
        aria-hidden
        className="animate-onboarding-drift-a pointer-events-none absolute -left-16 top-4 h-72 w-72 rounded-full bg-[#3b82f7]/25 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-onboarding-drift-b pointer-events-none absolute -right-12 top-24 h-72 w-72 rounded-full bg-[#22a35f]/20 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-onboarding-drift-a pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#a855f7]/15 blur-3xl [animation-delay:-8s]"
      />

      <div className="relative flex flex-col items-center">
        <span className="animate-onboarding-fade-up inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3b82f7] shadow-sm backdrop-blur [animation-delay:60ms]">
          <Accessibility className="h-3.5 w-3.5" strokeWidth={2.4} />
          <Trans>Built for every reader</Trans>
        </span>

        <h2 className="mt-6 max-w-[560px] text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0a0a0a]">
          <span className="animate-onboarding-fade-up inline-block [animation-delay:160ms]">
            <Trans>Reading, for</Trans>
          </span>{" "}
          <span className="animate-onboarding-fade-up relative inline-block [animation-delay:300ms]">
            <span className="animate-onboarding-gradient bg-[linear-gradient(90deg,#3b82f7,#0ea5e9,#22a35f,#3b82f7)] bg-[length:200%_auto] bg-clip-text text-transparent">
              <Trans>everyone.</Trans>
            </span>
          </span>
        </h2>

        <p className="animate-onboarding-fade-up mt-5 max-w-[460px] text-[16px] leading-relaxed text-[#525866] [animation-delay:460ms]">
          <Trans>
            Every learner deserves to read, listen, and understand. ADT Studio
            builds accessibility into every book — right from the first page.
          </Trans>
        </p>

        <div className="animate-onboarding-fade-up mt-9 flex flex-col items-center gap-3.5 [animation-delay:640ms]">
          <button
            type="button"
            onClick={onFinish}
            className="group inline-flex items-center gap-2.5 rounded-2xl bg-[#3b82f7] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_34px_-8px_rgba(59,130,247,0.55)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Trans>Add your first book</Trans>
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] font-medium text-[#9aa0aa] transition-colors hover:text-[#0a0a0a] cursor-pointer"
          >
            <Trans>Explore a sample instead</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}
