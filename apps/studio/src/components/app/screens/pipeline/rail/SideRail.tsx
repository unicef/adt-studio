import { useEffect, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { focusPanelToggle, useRailOpen } from "@/components/app/screens/pipeline/shared/panelFit"
import { cn } from "@/lib/utils"

export function RailCollapseButton({ className }: { className?: string }) {
  const { t } = useLingui()
  const [, setOpen] = useRailOpen()

  return (
    <button
      type="button"
      data-panel-toggle="rail-hide"
      onClick={() => {
        setOpen(false)
        focusPanelToggle("rail-show")
      }}
      title={t`Hide the left panel`}
      aria-label={t`Hide the left panel`}
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
  const [userOpen, setOpen] = useRailOpen()
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
        data-panel-toggle="rail-show"
        onClick={() => {
          setOpen(true)
          focusPanelToggle("rail-hide")
        }}
        inert={open || empty}
        aria-hidden={open || empty}
        title={t`Show the left panel`}
        aria-label={t`Show the left panel`}
        style={{ viewTransitionName: "step-rail-show" }}
        className={cn(
          "absolute top-6 left-6 z-20 grid size-8 place-items-center rounded-lg border bg-card/85 text-muted-foreground shadow-sm backdrop-blur-sm",
          "transition-[opacity,scale,background-color,color] ease-out hover:bg-muted hover:text-foreground motion-reduce:transition-none",
          open || empty || revealing ? "pointer-events-none scale-90 opacity-0 duration-100" : "scale-100 opacity-100 delay-150 duration-200",
        )}
      >
        <PanelLeftOpen className="size-3.5" />
      </button>
    </>
  )
}
