import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { hasViewTransitions } from "./shared/motion"
import { HeightMorph } from "./shared/HeightMorph"

/**
 * A place on the screen whose content is replaced as the flow moves on (`swap` keys the change).
 * With View Transitions it's a named place (`name`) that the morph moves and resizes, its content
 * crossfading (see shared/motion.ts). Without them, its height eases to the new content while the
 * content comes in with a short blur.
 */
export function Morph({ swap, name, children, className, inner }: { swap: string; name?: string; children: ReactNode; className?: string; inner?: string }) {
  if (hasViewTransitions)
    return (
      <div className={className} style={name ? { viewTransitionName: name } : undefined}>
        <div key={swap} className={cn("gd-enter", inner)}>
          {children}
        </div>
      </div>
    )
  return (
    <HeightMorph className={className}>
      <div key={swap} className={cn("height-morph-swap", inner)}>
        {children}
      </div>
    </HeightMorph>
  )
}
