import { useEffect, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useSideRailOpen } from "@/hooks/use-side-rail"
import { cn } from "@/lib/utils"

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
  widthClass: string
  children: React.ReactNode
  /** Nothing to list yet: the rail folds away, and opens smoothly once it has content. */
  empty?: boolean
}

let revealOnNextMount = false

export function SideRail({ widthClass, children, empty = false }: SideRailProps) {
  const { t } = useLingui()
  const [userOpen, setOpen] = useSideRailOpen()
  const [revealing, setRevealing] = useState(() => !empty && revealOnNextMount)

  useEffect(() => {
    if (empty) {
      revealOnNextMount = true
      return
    }
    revealOnNextMount = false
    if (!revealing) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setRevealing(false))
    })
    return () => cancelAnimationFrame(frame)
  }, [empty, revealing])

  const open = userOpen && !empty && !revealing

  return (
    <>
      <div
        data-chrome="rail"
        style={{ viewTransitionName: "step-rail" }}
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none",
          open ? cn(widthClass, "opacity-100") : "w-0 opacity-0",
        )}
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        inert={open || empty}
        aria-hidden={open || empty}
        title={t`Show the sidebar`}
        aria-label={t`Show the sidebar`}
        style={{ viewTransitionName: "step-rail-show" }}
        className={cn(
          "absolute bottom-5.5 left-5 z-20 grid size-10 place-items-center rounded-full border bg-card text-foreground shadow-[0_12px_30px_-12px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-300 ease-out hover:bg-muted motion-reduce:transition-none",
          open || empty || revealing ? "pointer-events-none scale-50 opacity-0" : "scale-100 opacity-100",
        )}
      >
        <PanelLeftOpen className="size-[18px]" />
      </button>
    </>
  )
}
