import { type ReactNode } from "react"
import { AppPreview } from "../../AppPreview"

/**
 * Shared cinematic stage for the finale variants: the real app centered behind a
 * dark veil that lifts (the reveal), a permanent bottom scrim that hides the
 * app's lower edge and keeps the headline legible, and a blue core glow. Overlay
 * content (logo, icons, copy) is passed as children and sits above every layer.
 */
export function FinaleStage({ veil, children }: { veil: number; children: ReactNode }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#070b1c]">
      {/* real app — centered, slight bleed so no edge is clipped asymmetrically */}
      <div className="absolute inset-x-0 top-8 mx-auto w-[104%] max-w-none">
        <AppPreview />
      </div>

      {/* dark veil that lifts to reveal the product */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#070b1c] transition-opacity duration-[1300ms] ease-out"
        style={{ opacity: veil }}
      />

      {/* permanent bottom scrim — hides the app's bottom edge + backs the copy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, transparent 40%, rgba(7,11,28,0.86) 62%, #070b1c 100%)",
        }}
      />

      {/* blue core glow behind the reveal point */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[40%] h-72 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(59,130,247,0.4), transparent)" }}
      />

      {children}
    </div>
  )
}
