import { useState, useEffect } from "react"
import { createFileRoute, Outlet, useParams, Link } from "@tanstack/react-router"
import { Home } from "lucide-react"
import { StepSidebar } from "@/components/v2/StepSidebar"
import { useBook } from "@/hooks/use-books"
import { useStepRunSSE, StepRunContext } from "@/hooks/use-step-run"
import { api } from "@/api/client"

export const Route = createFileRoute("/books/$label/v2")({
  component: V2Layout,
})

function V2Layout() {
  const { label } = Route.useParams()
  const { step } = useParams({ strict: false }) as { step?: string }
  const { data: book } = useBook(label)

  const activeStep = step ?? "book"

  // Step run SSE state
  const [sseEnabled, setSseEnabled] = useState(false)
  const { progress, startRun, reset } = useStepRunSSE(label, sseEnabled)

  // Auto-reconnect if a step run is already in progress on mount
  useEffect(() => {
    let cancelled = false
    api.getStepsStatus(label).then((status) => {
      if (!cancelled && status.status === "running") {
        setSseEnabled(true)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [label])

  // Disable SSE when run completes
  useEffect(() => {
    if (!progress.isRunning && (progress.isComplete || progress.error)) {
      // Keep SSE off, progress state preserved for "done" indicators
      setSseEnabled(false)
    }
  }, [progress.isRunning, progress.isComplete, progress.error])

  const ctxValue = { progress, startRun, reset, setSseEnabled }

  return (
    <StepRunContext value={ctxValue}>
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — spacer reserves layout width, inner panel expands on hover */}
        <div className="w-14 lg:w-[220px] shrink-0 relative">
          <div className="group/sidebar absolute inset-y-0 left-0 w-14 hover:w-[220px] lg:w-full bg-background flex flex-col z-30 overflow-hidden transition-[width] duration-150 hover:shadow-lg lg:hover:shadow-none">
            {/* App header */}
            <Link
              to="/"
              className="shrink-0 h-10 px-2 group-hover/sidebar:px-4 lg:px-4 flex items-center justify-center group-hover/sidebar:justify-start lg:justify-start gap-0 group-hover/sidebar:gap-2.5 lg:gap-2.5 bg-gray-700 text-white border-r border-gray-700 hover:bg-gray-600 transition-colors"
              title="Back to books"
            >
              <Home className="w-4 h-4 shrink-0" />
              <span className="text-sm font-semibold truncate hidden group-hover/sidebar:block lg:block">
                ADT Studio
              </span>
            </Link>

            {/* Steps */}
            <div className="flex-1 overflow-y-auto border-r border-gray-300">
              <StepSidebar bookLabel={label} activeStep={activeStep} />
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </StepRunContext>
  )
}
