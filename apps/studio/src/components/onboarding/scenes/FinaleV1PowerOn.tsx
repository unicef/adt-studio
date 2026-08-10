import { ArrowRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FinaleStage } from "./shared/FinaleStage"
import { useDemoLoop } from "./shared/useDemoLoop"
import type { OnboardingStepProps } from "../steps"

/**
 * Variant 1 — "The logo powers on the studio" (Arc-style orb→window reveal).
 * Dark field → logo mark glows center → a light ring bursts and the real app
 * blooms out of it as the veil lifts → headline + CTA settle. Bookends the 3D
 * logo intro; product is the hero.
 */
export function FinaleV1PowerOn({ onSkip }: OnboardingStepProps) {
  const phase = useDemoLoop(4, [560, 780, 950, 4000])
  const burst = phase >= 1
  const revealed = phase >= 2
  const textIn = phase >= 3
  return (
    <FinaleStage veil={revealed ? 0 : 1}>
      {/* logo orb + burst ring */}
      <div className="pointer-events-none absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2">
        <div
          aria-hidden
          className={cn(
            "absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#8ab4ff]/60 transition-all duration-[1100ms] ease-out",
            burst ? "scale-[3.4] opacity-0" : "scale-50 opacity-70",
          )}
        />
        <img
          src="/logo.png"
          alt=""
          aria-hidden
          className={cn(
            "relative h-24 w-24 object-contain transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            revealed ? "scale-[2.6] opacity-0" : "scale-100 opacity-100",
          )}
          style={{ filter: "drop-shadow(0 0 40px rgba(59,130,247,0.75))" }}
        />
      </div>

      <div
        className={cn(
          "absolute inset-x-0 bottom-14 flex flex-col items-center px-10 text-center transition-all duration-[700ms] ease-out",
          textIn ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        <h2 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
          <Trans>Reading, for</Trans>{" "}
          <span className="text-[#8ab4ff]">
            <Trans>everyone.</Trans>
          </span>
        </h2>
        <button
          type="button"
          onClick={onSkip}
          className="group mt-5 inline-flex items-center gap-2.5 rounded-2xl bg-white px-6 py-3.5 text-[15px] font-semibold text-[#0f1729] shadow-[0_16px_40px_-8px_rgba(40,90,220,0.6)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Trans>Go to Home</Trans>
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth={2.4}
          />
        </button>
      </div>
    </FinaleStage>
  )
}
