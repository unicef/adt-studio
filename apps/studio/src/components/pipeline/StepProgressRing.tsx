import type { UIStepState } from "@/hooks/use-step-run"

interface StepProgressRingProps {
  /** Icon diameter in pixels (ring renders slightly larger) */
  size: number
  /** Step state: idle | queued | running | done | error */
  state: UIStepState
  /** Tailwind color class prefix like "blue" for blue-500 */
  colorClass: string
}

/** Color class to actual stroke color mapping */
const COLOR_MAP: Record<string, string> = {
  "bg-blue-500": "#3b82f6",
  "bg-violet-500": "#8b5cf6",
  "bg-orange-500": "#f97316",
  "bg-teal-500": "#14b8a6",
  "bg-lime-500": "#84cc16",
  "bg-pink-500": "#ec4899",
  "bg-amber-500": "#f59e0b",
  "bg-gray-500": "#6b7280",
  "bg-white": "#ffffff",
}

/** Gap between icon edge and ring center in px */
const GAP = 3

export function StepProgressRing({
  size,
  state,
  colorClass,
}: StepProgressRingProps) {
  if (state === "idle") return null

  const strokeWidth = size >= 32 ? 2.5 : 2
  // Ring sits outside the icon with a gap
  const svgSize = size + GAP * 2 + strokeWidth
  const center = svgSize / 2
  const radius = size / 2 + GAP
  const circumference = 2 * Math.PI * radius
  const offset = (svgSize - size) / 2
  const color = COLOR_MAP[colorClass] ?? "#3b82f6"

  const svgStyle = {
    top: `-${offset}px`,
    left: `-${offset}px`,
  }

  if (state === "queued" || state === "running") {
    return (
      <svg
        width={svgSize}
        height={svgSize}
        className="absolute animate-spin pointer-events-none"
        style={{ ...svgStyle, animationDuration: "1.5s" }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
          strokeLinecap="round"
          opacity={0.7}
        />
      </svg>
    )
  }

  if (state === "done") {
    return (
      <svg
        width={svgSize}
        height={svgSize}
        className="absolute animate-fade-ring pointer-events-none"
        style={{ ...svgStyle, transform: "rotate(-90deg)" }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={0.5}
        />
      </svg>
    )
  }

  if (state === "error") {
    return (
      <svg
        width={svgSize}
        height={svgSize}
        className="absolute pointer-events-none"
        style={svgStyle}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#ef4444"
          strokeWidth={strokeWidth}
          opacity={0.6}
        />
      </svg>
    )
  }

  return null
}
