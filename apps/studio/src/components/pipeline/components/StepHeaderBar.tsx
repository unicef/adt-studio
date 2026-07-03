import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useWindowControls } from "@/hooks/use-window-controls"
import { usePlatform } from "@/hooks/use-platform"
import { LinuxControls } from "@/components/title-bar/LinuxControls"
import { WindowsControls } from "@/components/title-bar/WindowsControls"

/**
 * The colored bar at the top of a step view (step title, settings entry, etc.).
 *
 * Owns the two behaviours every step header must share so they can't drift out
 * of sync: it is a `drag-region` (the frameless desktop window is moved by
 * dragging it) and it hosts the Windows/Linux window controls, which are the
 * only min/maximize/close affordance when the OS chrome is hidden. Interactive
 * children opt out of dragging automatically via the `.drag-region *` rule.
 */
export function StepHeaderBar({
  color,
  className,
  children,
}: {
  /** Stage accent background color class (e.g. `stage.color`). */
  color: string
  className?: string
  children: ReactNode
}) {
  const { available: hasWindowControls } = useWindowControls()
  const platform = usePlatform()

  return (
    <div
      className={cn(
        "shrink-0 h-10 px-4 flex items-center gap-3 text-white drag-region",
        color,
        // Let the window controls sit flush to the right edge on Win/Linux.
        hasWindowControls && platform !== "macos" && "pr-0",
        className,
      )}
    >
      {children}
      <LinuxControls className="self-stretch" />
      <WindowsControls variant="dark" className="self-stretch" />
    </div>
  )
}
