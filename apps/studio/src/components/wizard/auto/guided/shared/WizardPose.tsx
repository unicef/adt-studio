import { cn } from "@/lib/utils"
import { useAssistantStyle } from "./assistantLook"

export type Pose = "hello" | "reading" | "thinking" | "celebrate"

/** The book wizard is the look: then the roomy places use its full-size poses. */
export const useIsWizard = () => useAssistantStyle().look === "wizard"

/**
 * The book wizard in full (arms, wand, sparkles), for places with room: the tour, reading the
 * book, the book created. A picture from public/add-book; it bobs gently while it talks.
 * Decoration only.
 */
export function WizardPose({ pose, size, talking, className }: { pose: Pose; size: number; talking?: boolean; className?: string }) {
  return <img src={`/add-book/wizard-${pose}.png`} alt="" aria-hidden draggable={false} data-talking={talking || undefined} className={cn("gd-pose pointer-events-none select-none object-contain", className)} style={{ width: size, height: size }} />
}
