import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from "react"
import {
  createFileRoute,
  Outlet,
  useParams,
  useNavigate,
  Link,
  useMatchRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { Home, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DebugPanel } from "@/components/debug/DebugPanel"
import { DebugPanelStateProvider, type DebugTabValue } from "@/components/debug/debug-panel-state"
import { StageSidebar } from "@/components/pipeline/components/StageSidebar"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { useBookRunStatus, BookRunProvider } from "@/hooks/use-book-run"
import { useExportWatcherSetup, ExportWatcherProvider } from "@/hooks/use-export-watcher"
import { usePlatform } from "@/hooks/use-platform"
import { useWindowControls } from "@/hooks/use-window-controls"
import { MacOSTrafficLightSpacer } from "@/components/title-bar"

interface SectionNavContext {
  sectionIndex: number
  setSectionIndex: (index: number | ((prev: number) => number)) => void
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
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugDefaultTab, setDebugDefaultTab] = useState<DebugTabValue>("stats")
  const isDebugRoute = !!matchRoute({ to: "/books/$label/debug", params: { label } })
  const exportWatcher = useExportWatcherSetup(label)
  const platform = usePlatform()
  const { available: hasWindowControls } = useWindowControls()
  const showMacOSSpacer = hasWindowControls && platform === "macos"

  const activeStep = step ?? "book"
  const [sectionIndex, setSectionIndex] = useState(0)
  const skipNextResetRef = useRef(false)
  const prevPageIdRef = useRef(pageId)
  const prevStepRef = useRef(activeStep)

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

  const openDebugPanel = useCallback((options?: { tab?: DebugTabValue }) => {
    setDebugDefaultTab(options?.tab ?? "stats")
    setDebugOpen(true)
  }, [])

  const debugPanelState = useMemo(
    () => ({
      openPanel: openDebugPanel,
      panelOpen: debugOpen,
    }),
    [debugOpen, openDebugPanel],
  )

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
    [navigate, label, activeStep],
  )

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isDebugRoute) return
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "d") {
      e.preventDefault()
      if (debugOpen) {
        setDebugOpen(false)
        return
      }
      openDebugPanel()
    }
  }, [debugOpen, isDebugRoute, openDebugPanel])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  if (isDebugRoute) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    )
  }

  return (
    <DebugPanelStateProvider value={debugPanelState}>
      <FloatingSaveProvider>
        <UnsavedChangesGuard />
        <SectionNavCtx.Provider value={sectionNav}>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <div className="relative w-[280px] shrink-0">
                <div className="absolute inset-y-0 left-0 z-30 flex w-full flex-col overflow-hidden bg-background">
                  <div
                    className="flex h-10 shrink-0 items-center border-r border-gray-700 bg-gray-700 text-white drag-region"
                  >
                    {showMacOSSpacer && <MacOSTrafficLightSpacer />}
                    <Link
                      to="/"
                      className="w-full flex h-full min-w-0 items-center gap-2.5 px-4 transition-colors hover:bg-gray-800"
                      title="Back to books"
                    >
                      <Home className="h-4 w-4 shrink-0" />
                      <span className="truncate text-sm font-semibold">
                        ADT Studio
                      </span>
                    </Link>
                    <div className="flex-1 h-full" />
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col border-r border-gray-300">
                    <StageSidebar
                      bookLabel={label}
                      activeStep={activeStep}
                      selectedPageId={pageId}
                      onSelectPage={onSelectPage}
                      sectionIndex={activeStep === "sectioning" ? undefined : sectionIndex}
                      onSelectSection={activeStep === "sectioning" ? undefined : setSectionIndex}
                    />
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <ExportWatcherProvider value={exportWatcher}>
                  <Outlet />
                </ExportWatcherProvider>
              </div>
            </div>

            {debugOpen && !isDebugRoute && (
              <DebugPanel
                label={label}
                isRunning={isRunning}
                defaultTab={debugDefaultTab}
                onClose={() => setDebugOpen(false)}
              />
            )}
          </div>

          {!debugOpen && !isDebugRoute && (
            <Button
              variant="outline"
              size="icon"
              className="fixed bottom-16 right-4 z-50 h-8 w-8 rounded-full shadow-md opacity-60 hover:opacity-100"
              onClick={() => openDebugPanel()}
              title="Debug Panel (Cmd+Shift+D)"
            >
              <Terminal className="h-4 w-4" />
            </Button>
          )}
        </SectionNavCtx.Provider>
      </FloatingSaveProvider>
    </DebugPanelStateProvider>
  )
}
