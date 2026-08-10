import { ArrowRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

// TODO: confirm the real docs URL. Placeholder points at the GitHub Pages docs.
export const DOCS_URL = "https://unicef.github.io/adt-studio/docs"

/**
 * Shared Luminous finale content — eyebrow, oversized headline with an entrance
 * light-sheen + gradient accent, subtext, primary CTA (breathing glow) and a
 * docs link. Variants wrap this over different backgrounds. `align` centers or
 * left-aligns the whole block.
 */
export function LuminousContent({
  align = "center",
  onSkip,
}: {
  align?: "left" | "center"
  onSkip: () => void
}) {
  const center = align === "center"
  return (
    <div
      className={cn(
        "relative z-10 flex w-full max-w-[640px] flex-col",
        center ? "items-center text-center" : "items-start text-left",
      )}
    >
      <div className="animate-onboarding-fade-up mb-7 flex items-center gap-2.5 [animation-delay:40ms]">
        <img src="/logo.png" alt="" aria-hidden className="h-9 w-9 object-contain" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b7688]">
          <Trans>Built for every reader</Trans>
        </span>
      </div>

      <div className="relative overflow-hidden pb-[0.12em]">
        <h2 className="text-[64px] font-semibold leading-[0.98] tracking-[-0.035em] text-[#0a0f1e]">
          <span className="block overflow-hidden pb-[0.08em]">
            <span className="animate-finale-rise inline-block [animation-delay:140ms]">
              <Trans>Reading,</Trans>
            </span>
          </span>
          <span className="block overflow-hidden pb-[0.08em]">
            <span className="animate-finale-rise inline-block [animation-delay:250ms]">
              <Trans>for</Trans>{" "}
              <span className="animate-onboarding-gradient bg-[linear-gradient(90deg,#2563eb,#22a3ff,#4f46e5,#2563eb)] bg-[length:200%_auto] bg-clip-text text-transparent">
                <Trans>everyone.</Trans>
              </span>
            </span>
          </span>
        </h2>
        <div
          aria-hidden
          className="animate-finale-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-overlay"
        />
      </div>

      <p className="animate-onboarding-fade-up mt-6 max-w-[460px] text-[17px] leading-relaxed text-[#4a5568] [animation-delay:520ms]">
        <Trans>
          Speech, translations, quizzes and a glossary — built into every book,
          so every learner can read, listen and understand.
        </Trans>
      </p>

      <div
        className={cn(
          "animate-onboarding-fade-up mt-9 flex items-center gap-5 [animation-delay:660ms]",
          center && "justify-center",
        )}
      >
        <div className="relative">
          <div
            aria-hidden
            className="animate-finale-glow pointer-events-none absolute -inset-2 rounded-[20px] bg-[#2563eb]/40 blur-xl"
          />
          <button
            type="button"
            onClick={onSkip}
            className="group relative inline-flex items-center gap-2.5 rounded-2xl bg-[#2563eb] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_34px_-10px_rgba(37,99,235,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1d4ed8] active:translate-y-0 cursor-pointer"
          >
            <Trans>Go to Home</Trans>
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              strokeWidth={2.4}
            />
          </button>
        </div>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[14px] font-medium text-[#8a93a6] transition-colors hover:text-[#0a0f1e] cursor-pointer"
        >
          <Trans>Read the docs</Trans>
        </a>
      </div>
    </div>
  )
}
