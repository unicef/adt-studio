import { cn } from "@/lib/utils"
import type { SVGProps } from "react"

/** Wireframe preview for the Storybook preset — open book viewed from above, illustration left + text right. */
export function StorybookWireframePreview({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 260 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full", className)}
      aria-hidden
      {...props}
    >
      <defs>
        <linearGradient id="spineGradL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="black" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity="0.07" />
        </linearGradient>
        <linearGradient id="spineGradR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="black" stopOpacity="0.07" />
          <stop offset="1" stopColor="black" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Book drop shadow */}
      <rect x="18" y="22" width="224" height="168" rx="5" fill="black" fillOpacity="0.07" />

      {/* Left page */}
      <rect x="13" y="16" width="113" height="168" rx="4" fill="white" stroke="#e5e5e5" strokeWidth="1" />

      {/* Right page */}
      <rect x="134" y="16" width="113" height="168" rx="4" fill="white" stroke="#e5e5e5" strokeWidth="1" />

      {/* Spine */}
      <rect x="124" y="16" width="12" height="168" fill="#f5f5f5" />
      <line x1="130" y1="16" x2="130" y2="184" stroke="#e0e0e0" strokeWidth="1" />

      {/* Spine depth shadows */}
      <rect x="112" y="16" width="12" height="168" fill="url(#spineGradL)" />
      <rect x="134" y="16" width="12" height="168" fill="url(#spineGradR)" />

      {/* ── Left page — illustration ────────────────────────────── */}

      {/* Sky */}
      <rect x="21" y="24" width="97" height="80" rx="2" fill="#f59e0b" fillOpacity="0.08" />

      {/* Sun */}
      <circle cx="100" cy="40" r="13" fill="#f59e0b" fillOpacity="0.22" />

      {/* Clouds */}
      <ellipse cx="42" cy="44" rx="14" ry="7" fill="white" />
      <ellipse cx="54" cy="40" rx="11" ry="7" fill="white" />
      <ellipse cx="65" cy="44" rx="12" ry="6" fill="white" />

      {/* Ground */}
      <ellipse cx="69" cy="142" rx="44" ry="9" fill="#f59e0b" fillOpacity="0.12" />

      {/* Tree */}
      <rect x="88" y="110" width="7" height="34" rx="2" fill="#f59e0b" fillOpacity="0.22" />
      <ellipse cx="91" cy="102" rx="14" ry="17" fill="#f59e0b" fillOpacity="0.2" />


      {/* ── Right page — large story text, centered ─────────────── */}
      <rect x="146" y="62" width="87" height="8" rx="2.5" fill="#d4d4d4" />
      <rect x="152" y="77" width="75" height="8" rx="2.5" fill="#d4d4d4" />
      <rect x="148" y="92" width="83" height="8" rx="2.5" fill="#d4d4d4" />
      <rect x="154" y="107" width="69" height="8" rx="2.5" fill="#d4d4d4" />
      <rect x="150" y="122" width="79" height="8" rx="2.5" fill="#d4d4d4" />
      <rect x="156" y="137" width="63" height="8" rx="2.5" fill="#d4d4d4" />
    </svg>
  )
}
