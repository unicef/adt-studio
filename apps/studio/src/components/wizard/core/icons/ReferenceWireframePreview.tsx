import { cn } from "@/lib/utils"
import type { SVGProps } from "react"

/** Wireframe preview for the Reference preset — dense text, section headings, and a table. */
export function ReferenceWireframePreview({
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
      <rect x="18" y="8" width="224" height="184" rx="3" fill="white" stroke="#e5e5e5" strokeWidth="1" />

      {/* Page number top-right */}
      <rect x="214" y="14" width="20" height="3" rx="1" fill="#d4d4d4" />

      {/* Section 1 heading */}
      <rect x="30" y="20" width="80" height="5" rx="1.5" fill="#10b981" fillOpacity="0.6" />
      <line x1="30" y1="29" x2="230" y2="29" stroke="#10b981" strokeOpacity="0.22" strokeWidth="1" />

      {/* Dense text block 1 */}
      <rect x="30" y="33" width="200" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="30" y="38" width="186" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="30" y="43" width="196" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="30" y="48" width="164" height="2.5" rx="1" fill="#d4d4d4" />

      {/* Table */}
      <rect x="30" y="58" width="200" height="68" rx="2" fill="#10b981" fillOpacity="0.03" stroke="#10b981" strokeOpacity="0.2" strokeWidth="1" />
      {/* Header row */}
      <rect x="30" y="58" width="200" height="13" rx="2" fill="#10b981" fillOpacity="0.09" />
      {/* Column dividers */}
      <line x1="98" y1="58" x2="98" y2="126" stroke="#10b981" strokeOpacity="0.18" strokeWidth="1" />
      <line x1="166" y1="58" x2="166" y2="126" stroke="#10b981" strokeOpacity="0.18" strokeWidth="1" />
      {/* Row dividers */}
      <line x1="30" y1="71" x2="230" y2="71" stroke="#10b981" strokeOpacity="0.12" strokeWidth="1" />
      <line x1="30" y1="84" x2="230" y2="84" stroke="#10b981" strokeOpacity="0.12" strokeWidth="1" />
      <line x1="30" y1="97" x2="230" y2="97" stroke="#10b981" strokeOpacity="0.12" strokeWidth="1" />
      <line x1="30" y1="110" x2="230" y2="110" stroke="#10b981" strokeOpacity="0.12" strokeWidth="1" />
      {/* Header labels */}
      <rect x="38" y="62" width="42" height="3" rx="1" fill="#10b981" fillOpacity="0.48" />
      <rect x="106" y="62" width="38" height="3" rx="1" fill="#10b981" fillOpacity="0.48" />
      <rect x="174" y="62" width="30" height="3" rx="1" fill="#10b981" fillOpacity="0.48" />
      {/* Row 1 */}
      <rect x="38" y="75" width="34" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="106" y="75" width="46" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="174" y="75" width="24" height="2.5" rx="1" fill="#d4d4d4" />
      {/* Row 2 */}
      <rect x="38" y="88" width="40" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="106" y="88" width="36" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="174" y="88" width="30" height="2.5" rx="1" fill="#d4d4d4" />
      {/* Row 3 */}
      <rect x="38" y="101" width="30" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="106" y="101" width="50" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="174" y="101" width="20" height="2.5" rx="1" fill="#d4d4d4" />
      {/* Row 4 */}
      <rect x="38" y="114" width="38" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="106" y="114" width="40" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="174" y="114" width="26" height="2.5" rx="1" fill="#d4d4d4" />

      {/* Section 2 heading */}
      <rect x="30" y="136" width="64" height="4.5" rx="1.5" fill="#10b981" fillOpacity="0.5" />
      <line x1="30" y1="144" x2="230" y2="144" stroke="#10b981" strokeOpacity="0.18" strokeWidth="1" />

      {/* Dense text block 2 */}
      <rect x="30" y="148" width="200" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="30" y="153" width="178" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="30" y="158" width="190" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="30" y="163" width="148" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="30" y="168" width="172" height="2.5" rx="1" fill="#d4d4d4" />
      <rect x="30" y="173" width="120" height="2.5" rx="1" fill="#d4d4d4" />
    </svg>
  )
}
