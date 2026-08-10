import { useRef } from "react"
import { ArrowRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { prefersReducedMotion } from "@/lib/utils"
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
 * Exaggerated-minimal: oversized type on warm white, one blue accent, a living
 * feature-colored aurora, a masked line-rise reveal, an entrance light-sheen
 * across the headline, and subtle pointer parallax for depth.
 */
export function FinaleLuminous({ onSkip }: OnboardingStepProps) {
  const auroraRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion()) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      if (auroraRef.current)
        auroraRef.current.style.transform = `translate3d(${px * 26}px, ${py * 26}px, 0)`
      if (contentRef.current)
        contentRef.current.style.transform = `translate3d(${px * -10}px, ${py * -8}px, 0)`
    })
  }

  const onLeave = () => {
    cancelAnimationFrame(frame.current)
    if (auroraRef.current) auroraRef.current.style.transform = ""
    if (contentRef.current) contentRef.current.style.transform = ""
  }

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative flex h-full w-full flex-col justify-center overflow-hidden bg-[#fbfcff] pl-14 pr-12"
    >
      {/* living, feature-colored aurora — blooms in, then drifts + parallaxes */}
      <div ref={auroraRef} className="pointer-events-none absolute inset-0 transition-transform duration-500 ease-out">
        <div className="animate-finale-aurora-in absolute inset-0">
          <Blob className="-left-24 -top-20 h-[22rem] w-[22rem] bg-[#3b82f7]/20" />
          <Blob className="right-[-12%] top-[-14%] h-80 w-80 bg-[#db2777]/14" delay={-6} />
          <Blob className="bottom-[-20%] left-[30%] h-[24rem] w-[24rem] bg-[#65a30d]/14" delay={-11} />
          <Blob className="bottom-[-12%] right-[4%] h-72 w-72 bg-[#ea580c]/12" delay={-3} />
          <Blob className="left-[52%] top-[18%] h-64 w-64 bg-[#e11d48]/10" delay={-8} />
        </div>
      </div>

      <div ref={contentRef} className="relative max-w-[640px] transition-transform duration-500 ease-out">
        <div className="animate-onboarding-fade-up mb-7 flex items-center gap-2.5 [animation-delay:40ms]">
          <img src="/logo.png" alt="" aria-hidden className="h-9 w-9 object-contain" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b7688]">
            <Trans>Built for every reader</Trans>
          </span>
        </div>

        {/* headline with one-time light sheen */}
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

        <p className="animate-onboarding-fade-up mt-6 max-w-[440px] text-[17px] leading-relaxed text-[#4a5568] [animation-delay:520ms]">
          <Trans>
            Speech, translations, quizzes and a glossary — built into every book,
            so every learner can read, listen and understand.
          </Trans>
        </p>

        <div className="animate-onboarding-fade-up mt-9 flex items-center gap-5 [animation-delay:660ms]">
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
