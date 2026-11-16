import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Opens and closes a slot by animating its height, so a banner arriving at the top of the page
 * slides the rest down instead of shoving it, and one leaving slides it back up.
 *
 * It keeps the last content it was shown while it closes: a notice that emptied the moment it
 * was dismissed would collapse as a blank box, which reads as a glitch, not as leaving.
 */
export function Reveal({
  show,
  children,
  className,
}: {
  show: boolean
  children: ReactNode
  className?: string
}) {
  const [kept, setKept] = useState<ReactNode>(show ? children : null)
  if (show && kept !== children) setKept(children)

  return (
    <div
      aria-hidden={show ? undefined : true}
      inert={show ? undefined : true}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={className}>{show ? children : kept}</div>
      </div>
    </div>
  )
}

/** Swaps one piece of content for the next with a short fade, keyed on what the content is. */
export function FadeSwap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <div
      key={id}
      className={cn(
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 motion-safe:ease-out",
        className,
      )}
    >
      {children}
    </div>
  )
}
