import { useEffect, useState, type ReactNode } from "react"
import { Terminal } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { DebugPanel } from "@/components/debug/DebugPanel"

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
  const { t } = useLingui()
  const [open, setOpen] = useState(false)

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
    <>
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

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t`Debug panel (⌘⇧D)`}
          aria-label={t`Open the debug panel`}
          className="fixed bottom-[74px] right-6 z-50 grid size-9 place-items-center rounded-full border bg-card/85 text-muted-foreground opacity-60 shadow-md backdrop-blur-sm transition-[opacity,color] hover:text-foreground hover:opacity-100"
        >
          <Terminal className="size-4" />
        </button>
      )}
    </>
  )
}
