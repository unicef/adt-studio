import { ArrowRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FinaleStage } from "./shared/FinaleStage"
import { useDemoLoop } from "./shared/useDemoLoop"
import type { OnboardingStepProps } from "../steps"

/**
 * Variant 2 — "Lights up" (curtain call). The real app is present but dark; a
 * soft light sweeps top→bottom and the veil lifts, so the product resolves crisp
 * — like stage lights coming up. Restraint, product-as-hero, no logo.
 */
export function FinaleV2LightsUp({ onSkip }: OnboardingStepProps) {
  const phase = useDemoLoop(3, [700, 1900, 4000])
  const lit = phase >= 1
  const textIn = phase >= 2
  return (
    <FinaleStage veil={lit ? 0 : 0.98}>
      {/* light sweep bar */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-64 h-64 transition-transform duration-[1800ms] ease-[cubic-bezier(0.5,0,0.2,1)]",
          lit ? "translate-y-[760px]" : "translate-y-0",
        )}
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(138,180,255,0.10) 40%, rgba(138,180,255,0.34) 50%, rgba(138,180,255,0.10) 60%, transparent 100%)",
        }}
      />

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
