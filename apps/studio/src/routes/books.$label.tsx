import { useState, useEffect, useCallback } from "react"
import { createFileRoute, Outlet, useParams, useNavigate, Link, useMatchRoute } from "@tanstack/react-router"
import { Home, Settings, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DebugPanel } from "@/components/debug/DebugPanel"
import { StageSidebar } from "@/components/pipeline/StageSidebar"
import { useBook } from "@/hooks/use-books"
import { useStepRunSSE, StepRunContext } from "@/hooks/use-step-run"
import { useSettingsDialog } from "@/routes/__root"
import { api } from "@/api/client"

export const Route = createFileRoute("/books/$label")({
  component: BookLayout,
})

function BookLayout() {
  const { label } = Route.useParams()
  const { step, pageId } = useParams({ strict: false }) as { step?: string; pageId?: string }
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()
  const { data: book } = useBook(label)
  const [debugOpen, setDebugOpen] = useState(false)
  const isDebugRoute = !!matchRoute({ to: "/books/$label/debug", params: { label } })

  const activeStep = step ?? "book"

  const onSelectPage = useCallback(
    (pid: string | null) => {
      if (pid) {
        navigate({
          to: "/books/$label/$step/$pageId",
          params: { label, step: activeStep, pageId: pid },
        })
      } else {
        navigate({
          to: "/books/$label/$step",
          params: { label, step: activeStep },
        })
      }
    },
    [navigate, label, activeStep]
  )

  // Step run SSE state
  const [sseEnabled, setSseEnabled] = useState(false)
  const { progress, startRun, reset } = useStepRunSSE(label, sseEnabled)

  // Auto-reconnect if a step run is already in progress on mount
  useEffect(() => {
    let cancelled = false
    api.getStepsStatus(label).then((status) => {
      if (!cancelled && status.status === "running") {
        if (status.fromStep && status.toStep) {
          startRun(status.fromStep, status.toStep)
        }
        setSseEnabled(true)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [label, startRun])

  // Disable SSE when run completes
  useEffect(() => {
    if (!progress.isRunning && (progress.isComplete || progress.error)) {
      // Keep SSE off, progress state preserved for "done" indicators
      setSseEnabled(false)
    }
  }, [progress.isRunning, progress.isComplete, progress.error])

  const ctxValue = { progress, startRun, reset, setSseEnabled }
  const { openSettings } = useSettingsDialog()

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

  if (isDebugRoute) {
    return (
      <StepRunContext value={ctxValue}>
        <div className="flex flex-1 min-h-0 flex-col">
          <Outlet />
        </div>
      </StepRunContext>
    )
  }

  return (
    <StepRunContext value={ctxValue}>
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex flex-1 min-h-0">
          {/* Left sidebar — spacer reserves layout width, inner panel expands on hover */}
          <div className="w-14 lg:w-[220px] shrink-0 relative">
            <div className="group/sidebar absolute inset-y-0 left-0 w-14 hover:w-[220px] lg:w-full bg-background flex flex-col z-30 overflow-hidden transition-[width] duration-150 hover:shadow-lg lg:hover:shadow-none">
              {/* App header */}
              <div className="shrink-0 h-10 flex items-center bg-gray-700 text-white border-r border-gray-700">
                <Link
                  to="/"
                  className="flex-1 min-w-0 h-full px-2 group-hover/sidebar:px-4 lg:px-4 flex items-center justify-center group-hover/sidebar:justify-start lg:justify-start gap-0 group-hover/sidebar:gap-2.5 lg:gap-2.5 hover:bg-gray-600 transition-colors"
                  title="Back to books"
                >
                  <Home className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-semibold truncate hidden group-hover/sidebar:block lg:block">
                    ADT Studio
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-white/70 hover:text-white hover:bg-gray-600 hidden group-hover/sidebar:flex lg:flex"
                  onClick={openSettings}
                  title="API Key Settings"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Steps / Pages */}
              <div className="flex-1 min-h-0 flex flex-col border-r border-gray-300">
                <StageSidebar bookLabel={label} activeStep={activeStep} selectedPageId={pageId} onSelectPage={onSelectPage} />
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <Outlet />
          </div>
        </div>

        {debugOpen && !isDebugRoute && (
          <DebugPanel
            label={label}
            isRunning={progress.isRunning}
            onClose={() => setDebugOpen(false)}
          />
        )}
      </div>

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
    </StepRunContext>
  )
}
