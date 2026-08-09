import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Check } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { useApiKey } from "@/hooks/use-api-key"
import { AppPreview } from "../AppPreview"
import type { OnboardingStepProps } from "../steps"

/**
 * Finale — Variant with a state recap. Same cinematic close (real app rising
 * behind a dark vignette) plus a row of chips confirming what got connected, and
 * a quiet secondary action for people who don't want to import a book yet.
 */
export function FinaleSceneRecap({ onFinish, onSkip }: OnboardingStepProps) {
  const [mounted, setMounted] = useState(false)
  const k = useApiKey()
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const chips = useMemo(() => {
    /* eslint-disable lingui/no-unlocalized-strings -- provider brand names, not translated */
    const all: [string, string][] = [
      [k.apiKey, "OpenAI"],
      [k.anthropicKey, "Anthropic"],
      [k.googleKey, "Google AI"],
      [k.customBaseUrl, "Custom"],
      [k.azureKey, "Azure Speech"],
    ]
    /* eslint-enable lingui/no-unlocalized-strings */
    return all.filter(([v]) => v.trim().length > 0).map(([, name]) => name)
  }, [k])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className={cn(
          "absolute inset-x-0 top-8 mx-auto w-[112%] max-w-none -translate-x-[6%] transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-100 opacity-100" : "scale-[1.06] opacity-0",
        )}
      >
        <AppPreview />
      </div>

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

        {/* recap chips */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {chips.length > 0 ? (
            chips.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[12.5px] font-medium text-white backdrop-blur-sm"
              >
                <Check className="h-3.5 w-3.5 text-[#7ef0b0]" strokeWidth={3} />
                {name}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[12.5px] font-medium text-[#d3d9e8] backdrop-blur-sm">
              <Trans>No keys yet — add a provider anytime in Settings</Trans>
            </span>
          )}
        </div>

        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#d3d9e8]">
          <Trans>Everything's set up. Step into ADT Studio and add your first book.</Trans>
        </p>

        <button
          type="button"
          onClick={onFinish}
          className="group mt-6 inline-flex items-center gap-2.5 rounded-2xl bg-white px-6 py-3.5 text-[15px] font-semibold text-[#0f1729] shadow-[0_16px_40px_-8px_rgba(40,90,220,0.6)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Trans>Add your first book</Trans>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.4} />
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="mt-3.5 text-[12.5px] font-medium text-[#9fa8bf] transition-colors hover:text-white cursor-pointer"
        >
          <Trans>I'll do that later — go to Home</Trans>
        </button>
      </div>
    </div>
  )
}
