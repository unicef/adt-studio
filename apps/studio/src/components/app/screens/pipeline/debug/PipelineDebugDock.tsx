import { useEffect, useMemo, useState, type ReactNode } from "react"
import { DebugPanel } from "@/components/debug/DebugPanel"
import { PipelineDebugContext } from "./debugDock"

export interface PipelineDebugDockProps {
  label: string
  isRunning: boolean
  children: ReactNode
}

export function PipelineDebugDock({
  label,
  isRunning,
  children,
}: PipelineDebugDockProps) {
  const [open, setOpen] = useState(false)
  const controls = useMemo(() => ({ open: () => setOpen(true) }), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
      if (event.key.toLowerCase() !== "d") return
      event.preventDefault()
      setOpen((wasOpen) => !wasOpen)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  return (
    <PipelineDebugContext.Provider value={controls}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">{children}</div>
        {open && (
          <DebugPanel
            label={label}
            isRunning={isRunning}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </PipelineDebugContext.Provider>
  )
}
