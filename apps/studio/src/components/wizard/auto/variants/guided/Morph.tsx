import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { HeightMorph } from "../livechat/ideas/expand/HeightMorph"
import { useGuidedIdea } from "./ideas"

/**
 * A place on the screen whose content is replaced as the flow moves on (`swap` keys the change).
 * b10 (the default): its height eases to the new content while the content crossfades in with a
 * short blur. Plain: the content is just replaced.
 */
export function Morph({ swap, children, className, inner }: { swap: string; children: ReactNode; className?: string; inner?: string }) {
  const morph = useGuidedIdea("expand") === "b10"
  if (!morph)
    return (
      <div className={className}>
        <div key={swap} className={inner}>
          {children}
        </div>
      </div>
    )
  return (
    <HeightMorph className={className}>
      <div key={swap} className={cn("ix-swap", inner)}>
        {children}
      </div>
    </HeightMorph>
  )
}
