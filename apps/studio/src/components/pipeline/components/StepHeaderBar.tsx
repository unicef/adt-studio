import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useWindowControls } from "@/hooks/use-window-controls"
import { usePlatform } from "@/hooks/use-platform"
import { LinuxControls } from "@/components/title-bar/LinuxControls"
import { WindowsControls } from "@/components/title-bar/WindowsControls"

/**
 * Colored bar at the top of a step view. Owns the `drag-region` and the
 * Windows/Linux window controls so every step header keeps them in sync.
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
