import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

export type AssistantMood = "idle" | "talking" | "thinking"

/**
 * The ADT Assistant: the brand orb with a face, so it feels alive. Idle, it breathes and blinks
 * now and then; talking, its mouth moves and a soft ring ripples out; thinking (reading the
 * book), its eyes look from side to side. Decoration only; still with reduced motion.
 */
export function Assistant({ mood = "idle", size = 36, className }: { mood?: AssistantMood; size?: number; className?: string }) {
  return (
    <span aria-hidden data-mood={mood} className={cn("gd-ai relative inline-grid shrink-0 place-items-center", className)} style={{ "--ai": `${size}px` } as CSSProperties}>
      <span className="gd-ai-ring" />
      <span className="gd-ai-body lc-orb">
        <svg viewBox="0 0 40 40" className="gd-ai-face">
          <g className="gd-ai-eyes">
            <ellipse cx="14.5" cy="18" rx="2.6" ry="3.4" />
            <ellipse cx="25.5" cy="18" rx="2.6" ry="3.4" />
          </g>
          <path className="gd-ai-smile" d="M15.5 25 Q20 29.5 24.5 25" />
          <ellipse className="gd-ai-mouth" cx="20" cy="26.5" rx="3.6" ry="1.8" />
        </svg>
      </span>
    </span>
  )
}
