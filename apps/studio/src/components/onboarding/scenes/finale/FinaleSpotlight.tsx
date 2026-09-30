import { LuminousContent } from "./LuminousContent"
import type { OnboardingStepProps } from "../../steps"

/* eslint-disable lingui/no-unlocalized-strings -- inline SVG noise data URI, not UI copy */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"
/* eslint-enable lingui/no-unlocalized-strings */

/** A3 — centered Luminous over a warm spotlight, faint concentric rings + grain. */
export function FinaleSpotlight({ onSkip }: OnboardingStepProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--ob-bg)] px-14">
      {/* warm spotlight from behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(64% 58% at 50% 42%, rgba(var(--ob-accent-rgb),0.14), transparent 72%)",
        }}
      />

      {/* concentric rings — reading reaching outward */}
      <div className="animate-finale-aurora-in pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
        {[420, 640, 880, 1140].map((d) => (
          <div
            key={d}
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(var(--ob-accent-rgb),0.09)]"
            style={{ width: d, height: d }}
          />
        ))}
      </div>

      {/* film grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045] mix-blend-multiply"
        style={{ backgroundImage: GRAIN }}
      />

      <LuminousContent align="center" onSkip={onSkip} />
    </div>
  )
}
