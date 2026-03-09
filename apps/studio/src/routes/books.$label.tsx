import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from "react"
import { createFileRoute, Outlet, useParams, useNavigate, Link, useMatchRoute } from "@tanstack/react-router"
import { Home, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DebugPanel } from "@/components/debug/DebugPanel"
import { StageSidebar } from "@/components/pipeline/StageSidebar"
import { useBook } from "@/hooks/use-books"
import { useBookRunStatus, BookRunProvider } from "@/hooks/use-book-run"

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

export const Route = createFileRoute("/books/$label")({
  component: BookLayout,
})

function BookLayout() {
  const { label } = Route.useParams()
  const bookRun = useBookRunStatus(label)

  return (
    <BookRunProvider value={bookRun}>
      <BookLayoutInner label={label} isRunning={bookRun.isRunning} />
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
