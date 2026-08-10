import { ArrowRight, Accessibility } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { AuroraText } from "@/components/ui/magicui/aurora-text"
import { WordRotate } from "@/components/ui/magicui/word-rotate"
import type { OnboardingStepProps } from "../steps"

// Reader-facing promises drawn from the pipeline stages (speech, translate, quizzes, glossary).
const ROTATE = [
  "read aloud.",
  "in any language.",
  "checked with quizzes.",
  "every word explained.",
  "made accessible.",
]

/** Finale variant C5 — MagicUI AuroraText hero + WordRotate cycling reader promises (ends on "for everyone."). */
export function FinaleSceneWords({ onFinish, onSkip }: OnboardingStepProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-10 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_-10%,#eaf3ff_0%,#ffffff_55%,#eafbf1_100%)]" />
      <div
        aria-hidden
        className="animate-onboarding-drift-a pointer-events-none absolute -left-16 top-8 h-72 w-72 rounded-full bg-[#3b82f7]/20 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-onboarding-drift-b pointer-events-none absolute -right-12 bottom-4 h-72 w-72 rounded-full bg-[#22a35f]/15 blur-3xl"
      />

      <div className="relative flex flex-col items-center">
        <span className="animate-onboarding-fade-up inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3b82f7] shadow-sm backdrop-blur [animation-delay:60ms]">
          <Accessibility className="h-3.5 w-3.5" strokeWidth={2.4} />
          <Trans>Built for every reader</Trans>
        </span>

        <div className="animate-onboarding-fade-up mt-6 flex flex-col items-center [animation-delay:160ms]">
          <h2 className="text-[46px] font-semibold leading-[1.02] tracking-[-0.03em] text-[#0a0a0a]">
            <Trans>Every book,</Trans>
          </h2>
          <WordRotate
            words={ROTATE}
            duration={1400}
            loop={false}
            className="bg-[linear-gradient(90deg,#e11d48,#db2777,#ea580c,#65a30d,#3b82f7)] bg-clip-text text-[46px] font-semibold leading-[1.02] tracking-[-0.03em] text-transparent"
            motionProps={{
              initial: { opacity: 0, y: 24 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -24 },
              transition: { duration: 0.28, ease: "easeOut" },
            }}
          />
        </div>

        <p className="animate-onboarding-fade-up mt-4 max-w-[460px] text-[16px] leading-relaxed text-[#525866] [animation-delay:1400ms]">
          <Trans>
            Every learner deserves to read, listen, and understand. ADT Studio
            builds accessibility into every book — right from the first page.
          </Trans>
        </p>

        <h3 className="animate-onboarding-fade-up mt-7 text-[22px] font-semibold tracking-[-0.02em] text-[#0a0a0a] [animation-delay:1600ms]">
          <Trans>Reading, for</Trans>{" "}
          <AuroraText colors={["#3b82f7", "#0ea5e9", "#22a35f", "#3b82f7"]}>everyone.</AuroraText>
        </h3>

        <div className="animate-onboarding-fade-up mt-8 flex flex-col items-center gap-3 [animation-delay:1800ms]">
          <button
            type="button"
            onClick={onFinish}
            className="group inline-flex items-center gap-2.5 rounded-2xl bg-[#3b82f7] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_34px_-8px_rgba(59,130,247,0.55)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Trans>Add your first book</Trans>
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2.4}
            />
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
