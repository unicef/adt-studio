import { cn } from "@/lib/utils"
import type { SVGProps } from "react"

/** Wireframe preview for the Textbooks & Activities preset. */
export function TextbookWireframePreview({
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
      {/* Page background */}
      <rect x="22" y="10" width="216" height="180" rx="3" fill="white" stroke="#e5e5e5" strokeWidth="1" />

      {/* Chapter header */}
      <rect x="22" y="10" width="216" height="28" rx="3" fill="#3b82f6" fillOpacity="0.1" />
      <rect x="22" y="34" width="216" height="4" fill="#3b82f6" fillOpacity="0.05" />
      <rect x="36" y="18" width="64" height="5" rx="1.5" fill="#3b82f6" fillOpacity="0.65" />
      <rect x="106" y="20" width="36" height="3" rx="1" fill="#3b82f6" fillOpacity="0.3" />

      {/* Left content column - text lines */}
      <rect x="36" y="50" width="100" height="3" rx="1" fill="#d4d4d4" />
      <rect x="36" y="57" width="88" height="3" rx="1" fill="#d4d4d4" />
      <rect x="36" y="64" width="94" height="3" rx="1" fill="#d4d4d4" />
      <rect x="36" y="71" width="78" height="3" rx="1" fill="#d4d4d4" />

      {/* Diagram / image box */}
      <rect x="148" y="46" width="74" height="48" rx="2" fill="#3b82f6" fillOpacity="0.07" stroke="#3b82f6" strokeOpacity="0.22" strokeWidth="1" />
      <rect x="156" y="54" width="58" height="28" rx="1.5" fill="#3b82f6" fillOpacity="0.1" />
      <circle cx="170" cy="63" r="5" fill="#3b82f6" fillOpacity="0.22" />
      <path d="M156 78 L168 68 L178 74 L184 68 L214 78" stroke="#3b82f6" strokeOpacity="0.35" strokeWidth="1.2" strokeLinejoin="round" />

      {/* Activity section */}
      <rect x="34" y="104" width="192" height="74" rx="3" fill="#3b82f6" fillOpacity="0.04" stroke="#3b82f6" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 2.5" />
      <rect x="44" y="112" width="54" height="4" rx="1.5" fill="#3b82f6" fillOpacity="0.45" />

      {/* Row 1 - unchecked */}
      <rect x="44" y="124" width="8" height="8" rx="1.5" stroke="#3b82f6" strokeOpacity="0.4" strokeWidth="1" />
      <rect x="58" y="126" width="110" height="3" rx="1" fill="#d4d4d4" />

      {/* Row 2 - unchecked */}
      <rect x="44" y="139" width="8" height="8" rx="1.5" stroke="#3b82f6" strokeOpacity="0.4" strokeWidth="1" />
      <rect x="58" y="141" width="88" height="3" rx="1" fill="#d4d4d4" />

      {/* Row 3 - checked */}
      <rect x="44" y="154" width="8" height="8" rx="1.5" fill="#3b82f6" fillOpacity="0.55" />
      <path d="M46.5 158 L49.5 161 L53 155.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="58" y="156" width="100" height="3" rx="1" fill="#d4d4d4" />
    </svg>
  )
}
