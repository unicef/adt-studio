import { useState, useEffect, useCallback } from "react"
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router"
import { Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DebugPanel } from "@/components/debug/DebugPanel"
import { usePipelineSSE, usePipelineStatus } from "@/hooks/use-pipeline"

export const Route = createFileRoute("/books/$label")({
  component: BookLayout,
})

function BookLayout() {
  const { label } = Route.useParams()
  const matchRoute = useMatchRoute()
  const isDebugRoute = !!matchRoute({ to: "/books/$label/debug", params: { label } })
  const [debugOpen, setDebugOpen] = useState(false)

  // SSE connection for debug panel — only active when debug panel is open
  const { data: pipelineStatus } = usePipelineStatus(label)
  const isRunning = pipelineStatus?.status === "running"
  const { progress } = usePipelineSSE(label, debugOpen && isRunning)

  // Cmd+Shift+D toggle (disabled on debug route — that page IS the debug view)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isDebugRoute) return
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "d") {
      e.preventDefault()
      setDebugOpen((prev) => !prev)
    }
  }, [isDebugRoute])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Main content area */}
      <div className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </div>

      {/* Debug panel (hidden on debug route — rendered full-page there) */}
      {debugOpen && !isDebugRoute && (
        <DebugPanel
          label={label}
          progress={progress}
          onClose={() => setDebugOpen(false)}
        />
      )}

      {/* Floating toggle button */}
      {!debugOpen && !isDebugRoute && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 h-8 w-8 rounded-full shadow-md z-50 opacity-60 hover:opacity-100"
          onClick={() => setDebugOpen(true)}
          title="Debug Panel (Cmd+Shift+D)"
        >
          <Terminal className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
