import { useLingui } from "@lingui/react/macro"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useSideRailOpen } from "@/hooks/use-side-rail"
import { cn } from "@/lib/utils"

/** Collapse control, placed in each rail's own header. */
export function RailCollapseButton({ className }: { className?: string }) {
  const { t } = useLingui()
  const [, setOpen] = useSideRailOpen()

  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      title={t`Hide the sidebar`}
      aria-label={t`Hide the sidebar`}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <PanelLeftClose className="size-3.5" />
    </button>
  )
}

export interface SideRailProps {
  /** Width the rail expands to — matches the width its content is built at. */
  widthClass: string
  children: React.ReactNode
}

/**
 * Collapsible frame around a left rail, mirroring the AI panel: the rail slides
 * its own width shut and hands the space to the canvas, leaving a floating
 * button to bring it back. Both halves stay mounted so both animations play.
 */
export function SideRail({ widthClass, children }: SideRailProps) {
  const { t } = useLingui()
  const [open, setOpen] = useSideRailOpen()

  return (
    <>
      <div
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? cn(widthClass, "opacity-100") : "w-0 opacity-0",
          "bg-accent"
        )}
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        inert={open}
        aria-hidden={open}
        title={t`Show the sidebar`}
        aria-label={t`Show the sidebar`}
        className={cn(
          "absolute bottom-5.5 left-5 z-20 grid size-10 place-items-center rounded-full border bg-card text-foreground shadow-[0_12px_30px_-12px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-300 ease-out hover:bg-muted motion-reduce:transition-none",
          open ? "pointer-events-none scale-50 opacity-0" : "scale-100 opacity-100",
        )}
      >
        <PanelLeftOpen className="size-[18px]" />
      </button>
    </>
  )
}
