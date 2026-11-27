import type { CSSProperties } from "react"
import { useLingui } from "@lingui/react"
import { msg } from "@lingui/core/macro"
import { cn } from "@/lib/utils"

export type AssistantMood = "idle" | "talking" | "thinking"

const NAME = msg`ADT Wizard`

/**
 * The assistant, the book wizard, small: its avatar picture in a soft ring. It bobs while it talks
 * and the ring breathes while it thinks. Decoration only; still with reduced motion. Where there
 * is room, `WizardPose` shows the whole character.
 */
export function Assistant({ mood = "idle", size = 36, className }: { mood?: AssistantMood; size?: number; className?: string }) {
  return (
    <span aria-hidden data-mood={mood} className={cn("gd-ai relative inline-grid shrink-0 place-items-center", className)} style={{ "--ai": `${size}px` } as CSSProperties}>
      <span className="gd-ai-ring" />
      <img src="/add-book/wizard-avatar.png" alt="" draggable={false} className="gd-pose relative h-full w-full object-contain" data-talking={mood === "talking" || undefined} />
    </span>
  )
}

/** The assistant's name ("ADT Wizard"). */
export function useAssistantName(): string {
  const { i18n } = useLingui()
  return i18n._(NAME)
}
