import { ArrowRight } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FinaleStage } from "./shared/FinaleStage"
import { FEATURE_META, type FeatureSlug } from "./shared/featureMeta"
import { useDemoLoop } from "./shared/useDemoLoop"
import type { OnboardingStepProps } from "../steps"

const ORDER: FeatureSlug[] = ["speech", "translate", "quizzes", "glossary"]
const START: { x: number; y: number }[] = [
  { x: -190, y: -120 },
  { x: 190, y: -120 },
  { x: -190, y: 120 },
  { x: 190, y: 120 },
]
// Tight 2×2 cluster they settle into before merging — so they read as four, not one stack.
const CLUSTER: { x: number; y: number }[] = [
  { x: -20, y: -20 },
  { x: 20, y: -20 },
  { x: -20, y: 20 },
  { x: 20, y: 20 },
]

/**
 * Variant 3 — "Feature convergence" (bookend the journey). The four reader
 * features the user just met — in their exact stage colors — fly in from the
 * edges and collapse into the logo, which bursts and blooms into the real app.
 */
export function FinaleV3Convergence({ onSkip }: OnboardingStepProps) {
  const phase = useDemoLoop(5, [460, 620, 640, 950, 4000])
  const converged = phase >= 1
  const merged = phase >= 2
  const revealed = phase >= 3
  const textIn = phase >= 4
  return (
    <FinaleStage veil={revealed ? 0 : 1}>
      {/* converging feature icons */}
      {ORDER.map((slug, i) => {
        const { Icon, hex, tint } = FEATURE_META[slug]
        const from = converged ? CLUSTER[i] : START[i]
        const dx = merged ? 0 : from.x
        const dy = merged ? 0 : from.y
        const sc = merged ? 0.3 : 1
        return (
          <div
            key={slug}
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-1/2 top-[40%] grid h-14 w-14 place-items-center rounded-2xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] transition-all duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              merged ? "opacity-0" : "opacity-100",
            )}
            style={{
              backgroundColor: tint,
              transform: `translate(-50%,-50%) translate(${dx}px, ${dy}px) scale(${sc})`,
            }}
          >
            <Icon className="h-7 w-7" style={{ color: hex }} strokeWidth={2.2} />
          </div>
        )
      })}

      {/* logo core + burst */}
      <div className="pointer-events-none absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2">
        <div
          aria-hidden
          className={cn(
            "absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#8ab4ff]/60 transition-all duration-[1000ms] ease-out",
            merged ? "scale-[3.2] opacity-0" : "scale-50 opacity-0",
          )}
        />
        <img
          src="/logo.png"
          alt=""
          aria-hidden
          className={cn(
            "relative h-24 w-24 object-contain transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            revealed
              ? "scale-[2.6] opacity-0"
              : merged
                ? "scale-100 opacity-100"
                : "scale-50 opacity-0",
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
