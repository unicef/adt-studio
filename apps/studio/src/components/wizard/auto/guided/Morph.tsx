import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { HeightMorph } from "./shared/HeightMorph"

/**
 * A place on the screen whose content is replaced as the flow moves on (`swap` keys the change):
 * its height eases to the new content while the content crossfades in with a short blur.
 */
export function Morph({ swap, children, className, inner }: { swap: string; children: ReactNode; className?: string; inner?: string }) {
  return (
    <HeightMorph className={className}>
      <div key={swap} className={cn("ix-swap", inner)}>
        {children}
      </div>
    </HeightMorph>
  )
}
