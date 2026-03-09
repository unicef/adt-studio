import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from "react"
import { createFileRoute, Outlet, useParams, useNavigate, Link, useMatchRoute } from "@tanstack/react-router"
import { Home, Terminal, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DebugPanel } from "@/components/debug/DebugPanel"
import { StageSidebar } from "@/components/pipeline/StageSidebar"
import { useBook } from "@/hooks/use-books"
import { useBookRunStatus, BookRunProvider } from "@/hooks/use-book-run"
import { useAiImageQueue, AiImageQueueContext } from "@/hooks/use-ai-image-queue"

// Section navigation context — shared between sidebar and all views
interface SectionNavContext {
  sectionIndex: number
  setSectionIndex: (index: number | ((prev: number) => number)) => void
  /** Set to true before a page change to prevent the parent from resetting sectionIndex to 0 */
  skipNextResetRef: React.MutableRefObject<boolean>
}
const SectionNavCtx = createContext<SectionNavContext>({
  sectionIndex: 0,
  setSectionIndex: () => {},
  skipNextResetRef: { current: false },
})
export function useSectionNav() { return useContext(SectionNavCtx) }

function AiJobNotifications({ label }: { label: string }) {
  const { jobs, clearJob } = useContext(AiImageQueueContext)
  const navigate = useNavigate()
  const { setSectionIndex, skipNextResetRef } = useSectionNav()

  if (jobs.length === 0) return null

  return (
    <div className="fixed bottom-14 right-4 z-50 flex flex-col gap-2 items-end">
      {jobs.map((job) => (
        <div
          key={job.jobId}
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 shadow-lg text-white text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            job.status === "pending"
              ? "bg-purple-600"
              : job.status === "done"
                ? "bg-green-600 cursor-pointer hover:bg-green-700 transition-colors"
                : "bg-destructive"
          }`}
          onClick={() => {
            if (job.status !== "done") return
            skipNextResetRef.current = true
            setSectionIndex(job.sectionIndex)
            void navigate({
              to: "/books/$label/$step/$pageId",
              params: { label, step: "storyboard", pageId: job.pageId },
            })
          }}
          title={job.status === "done" ? `View page ${job.pageId}` : undefined}
        >
          {job.status === "pending" && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
          {job.status === "done" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
          {job.status === "error" && <XCircle className="h-3 w-3 shrink-0" />}

          <span>
            {job.status === "pending" && "Generating image\u2026"}
            {job.status === "done" && `Image ready \u2014 view page ${job.pageId}`}
            {job.status === "error" && (job.error ?? "Image generation failed")}
          </span>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clearJob(job.jobId) }}
            className="p-0.5 rounded-full hover:bg-white/20 transition-colors cursor-pointer shrink-0"
            title="Dismiss"
          >
            <XCircle className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

export const Route = createFileRoute("/books/$label")({
  component: BookLayout,
})

function BookLayout() {
  const { label } = Route.useParams()
  const bookRun = useBookRunStatus(label)
  const aiImageQueue = useAiImageQueue(label)

  return (
    <BookRunProvider value={bookRun}>
      <AiImageQueueContext.Provider value={aiImageQueue}>
        <BookLayoutInner label={label} isRunning={bookRun.isRunning} />
      </AiImageQueueContext.Provider>
    </BookRunProvider>
  )
}

function BookLayoutInner({ label, isRunning }: { label: string; isRunning: boolean }) {
  const { step, pageId } = useParams({ strict: false }) as { step?: string; pageId?: string }
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()
  const { data: book } = useBook(label)
  const [debugOpen, setDebugOpen] = useState(false)
  const isDebugRoute = !!matchRoute({ to: "/books/$label/debug", params: { label } })

  const activeStep = step ?? "book"

  // Section index state — shared between sidebar and all views
  const [sectionIndex, setSectionIndex] = useState(0)
  const skipNextResetRef = useRef(false)
  const prevPageIdRef = useRef(pageId)
  const prevStepRef = useRef(activeStep)

  // Reset section index when page or step changes (unless a child signalled to skip)
  useEffect(() => {
    if (prevPageIdRef.current !== pageId || prevStepRef.current !== activeStep) {
      if (!skipNextResetRef.current) {
        setSectionIndex(0)
      }
      skipNextResetRef.current = false
      prevPageIdRef.current = pageId
      prevStepRef.current = activeStep
    }
  }, [pageId, activeStep])

  const sectionNav = useMemo(() => ({ sectionIndex, setSectionIndex, skipNextResetRef }), [sectionIndex, setSectionIndex])

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
      <div className="flex flex-1 min-h-0 flex-col">
        <Outlet />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex flex-1 min-h-0">
          {/* Left sidebar */}
          <div className="w-[220px] shrink-0 relative">
            <div className="absolute inset-y-0 left-0 w-full bg-background flex flex-col z-30 overflow-hidden">
              {/* App header */}
              <div className="shrink-0 h-10 flex items-center bg-gray-700 text-white border-r border-gray-700">
                <Link
                  to="/"
                  className="flex-1 min-w-0 h-full px-4 flex items-center justify-start gap-2.5 hover:bg-gray-800 transition-colors"
                  title="Back to books"
                >
                  <Home className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-semibold truncate">
                    ADT Studio
                  </span>
                </Link>
              </div>

              {/* Steps / Pages */}
              <div className="flex-1 min-h-0 flex flex-col border-r border-gray-300">
                <StageSidebar bookLabel={label} activeStep={activeStep} selectedPageId={pageId} onSelectPage={onSelectPage} sectionIndex={sectionIndex} onSelectSection={setSectionIndex} />
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <SectionNavCtx.Provider value={sectionNav}>
              <Outlet />
              <AiJobNotifications label={label} />
            </SectionNavCtx.Provider>
          </div>
        </div>

        {debugOpen && !isDebugRoute && (
          <DebugPanel
            label={label}
            isRunning={isRunning}
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
    </>
  )
}
