import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { AppPreview } from "../AppPreview"
import type { OnboardingStepProps } from "../steps"

/** Cinematic close: the real app rises behind a dark vignette; one action opens it. */
export function FinaleScene({ onFinish }: OnboardingStepProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* real app emerging */}
      <div
        className={cn(
          "absolute inset-x-0 top-8 mx-auto w-[112%] max-w-none -translate-x-[6%] transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-100 opacity-100" : "scale-[1.06] opacity-0",
        )}
      >
        <AppPreview />
      </div>

      {/* cinematic overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(9,14,34,0.55) 0%, rgba(8,12,30,0.72) 45%, rgba(5,9,26,0.94) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[44%] h-72 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(59,130,247,0.42), transparent)" }}
      />

      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center px-10 text-center transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
        style={{ transitionDelay: "250ms" }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b3c6ff]">
          <Trans>All set</Trans>
        </div>
        <h2 className="mt-3 text-[36px] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
          <Trans>Your studio is ready.</Trans>
        </h2>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#d3d9e8]">
          <Trans>Everything's set up. Step into ADT Studio and add your first book.</Trans>
        </p>
        <button
          type="button"
          autoFocus
          onClick={onFinish}
          className="group mt-7 inline-flex items-center gap-2.5 rounded-2xl bg-white px-6 py-3.5 text-[15px] font-semibold text-[#0f1729] shadow-[0_16px_40px_-8px_rgba(40,90,220,0.6)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Trans>Open ADT Studio</Trans>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.4} />
        </button>
        <div className="mt-3.5 text-[12.5px] font-medium text-[#9fa8bf]">
          <Trans>or press ↵</Trans>
        </div>
      </div>
    </div>
  )
}
