import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { useQuizzes } from "@/hooks/use-quizzes"
import { AiEditPanel } from "./plugins/AiEditPanel"
import { PipelineTopBar } from "./chrome/PipelineTopBar"
import { CanvasEmptyPanel } from "./canvas/CanvasEmptyPanel"
import { CanvasViewportControls } from "./canvas/CanvasViewportControls"
import { PageCanvas } from "./canvas/PageCanvas"
import { QuizCanvas } from "./canvas/QuizCanvas"
import { PagesRail } from "./rail/PagesRail"
import { PagesRailEmpty } from "./rail/PagesRailEmpty"
import { SideRail } from "./rail/SideRail"
import { useChromeRoot } from "@/components/app/lab/chrome"
import type { StoryboardPhase } from "./canvas/StoryboardEmptyState"
import { useCanvasNavigation } from "./canvas/useCanvasNavigation"
import type { RunActivity, RunStageActivity } from "./runs/useRunActivity"
import type { SectioningRun } from "./runs/useSectioningRun"
import type { StoryboardRun } from "./runs/useStoryboardRun"
import { StageRerunButton } from "./runs/StageRerunButton"
import { progressCounts } from "./runs/LiveRunPanel"
import { getStageRunningLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useStoryboardRerun } from "./runs/useStoryboardRerun"
import { useStoryboardStaleness } from "./runs/useStoryboardStaleness"
import { StoryboardStaleBanner } from "./canvas/StoryboardStaleBanner"
import { StoryboardVersionPicker } from "./canvas/StoryboardVersionPicker"
import { previewSectionId } from "./shared/previewTarget"
import type { PipelineState } from "./shared/usePipelineState"
import {
  useCanvasViewport,
  useCanvasZoom,
} from "./shared/workspacePrefs"
import { STORYBOARD_HEX } from "./shared/plugins"
import { useVariant } from "@/components/app/lab/variants"
import { cn } from "@/lib/utils"
import { useBookRun } from "@/hooks/use-book-run"
import { CanvasEditingProvider, useCanvasEditing } from "./canvas/editing/CanvasEditing"
import { LayersTree } from "./canvas/editing/LayersTree"
import { StyleSidePanel } from "./canvas/editing/StyleSidePanel"
import { CanvasSaveBar } from "./canvas/editing/CanvasSaveBar"
import type { RailTab } from "./rail/PagesRail"

export interface PipelineWorkspaceProps {
  label: string
  state: PipelineState
  run: RunActivity
  extractActivity: RunStageActivity
  sectioningActivity: RunStageActivity
  storyboardActivity: RunStageActivity
  sectioningRun: SectioningRun
  storyboardRun: StoryboardRun
  navigationEnabled: boolean
  pageId: string | null
  onSelectPage: (pageId: string) => void
  onOpenStep: (slug: string) => void
  onOpenSettings: (slug: string) => void
  onOpenPreview: (sectionId: string | null) => void
}

export function PipelineWorkspace({
  label,
  state,
  run,
  extractActivity,
  sectioningActivity,
  storyboardActivity,
  sectioningRun,
  storyboardRun,
  navigationEnabled,
  pageId,
  onSelectPage,
  onOpenStep,
  onOpenSettings,
  onOpenPreview,
}: PipelineWorkspaceProps) {
  const { t } = useLingui()
  const [viewport, setViewport] = useCanvasViewport()
  const [zoom, setZoom] = useCanvasZoom()
  const tbStatus = useVariant("topstatus")
  const chrome = useChromeRoot(STORYBOARD_HEX)
  const contentLoaders = useVariant("loaders") === "content"
  const treeVariant = useVariant("tree")
  const editorVariant = useVariant("editor")
  const [railTab, setRailTab] = useState<RailTab>("pages")
  const storyboardRerun = useStoryboardRerun(label)
  const staleness = useStoryboardStaleness(state.pages)
  const [chromeHidden, setChromeHidden] = useState(false)
  const [selectedQuizIndex, setSelectedQuizIndex] = useState<number | null>(null)
  const quizzesQuery = useQuizzes(label)
  const quizzes = useMemo(
    () => quizzesQuery.data?.quizzes?.quizzes ?? [],
    [quizzesQuery.data],
  )

  const activePage = useMemo(() => {
    if (state.pages.length === 0) return null
    return state.pages.find((p) => p.pageId === pageId) ?? state.pages[0]
  }, [state.pages, pageId])

  const activeQuiz = useMemo(
    () =>
      selectedQuizIndex == null
        ? null
        : quizzes.find((quiz) => quiz.quizIndex === selectedQuizIndex) ?? null,
    [quizzes, selectedQuizIndex],
  )


  const selectPage = (nextPageId: string) => {
    setSelectedQuizIndex(null)
    onSelectPage(nextPageId)
  }

  useCanvasNavigation({
    pages: state.pages,
    quizzes,
    activePageId: activePage?.pageId ?? null,
    activeQuizIndex: activeQuiz?.quizIndex ?? null,
    enabled: navigationEnabled,
    onSelectPage: selectPage,
    onSelectQuiz: setSelectedQuizIndex,
  })

  const empty = !state.hasSections || !state.hasRendering
  const buildingFirstPages =
    contentLoaders && state.hasSections && !state.hasRendering && storyboardActivity.isActive && state.pages.length > 0
  const showEmptyPanel = empty && !buildingFirstPages
  const phase: StoryboardPhase = state.hasSections ? "render" : "sections"
  const emptyRun = phase === "render" ? storyboardRun : sectioningRun
  const foundationRunning = extractActivity.isActive
    ? extractActivity
    : sectioningActivity.isActive
      ? sectioningActivity
      : storyboardActivity.isActive
        ? storyboardActivity
        : null

  const editingPageId = empty || activeQuiz ? null : activePage?.pageId ?? null
  const editingEnabled = !!editingPageId && (treeVariant !== "off" || editorVariant !== "off")

  const building = storyboardActivity.isActive ? progressCounts(storyboardActivity) : null
  const topStatusText =
    tbStatus === "current" || tbStatus === "none"
      ? null
      : building
        ? t`Building pages · ${building.done}/${building.total}`
        : storyboardActivity.isActive
          ? getStageRunningLabelI18n("storyboard")
          : tbStatus === "summary" && state.pages.length > 0
            ? plural(state.pages.length, { one: "# page", other: "# pages" })
            : null
  const topStatus = topStatusText ? (
    <span className="max-w-[260px] truncate rounded-full bg-muted px-2.5 py-0.5 text-[11px] tabular-nums text-muted-foreground animate-in fade-in duration-300">
      {topStatusText}
    </span>
  ) : undefined

  const topChrome = (
    <>
        <PipelineTopBar
          label={label}
          pageLabel={
            showEmptyPanel
              ? undefined
              : activeQuiz
                ? t`Quiz ${activeQuiz.quizIndex + 1}`
                : activePage
                  ? t`Page ${activePage.pageNumber}`
                  : undefined
          }
          version={empty || !activeQuiz ? null : quizzesQuery.data?.version ?? null}
          versionPicker={
            !empty && !activeQuiz && activePage ? (
              <StoryboardVersionPicker
                label={label}
                page={activePage}
                viewport={viewport}
              />
            ) : undefined
          }
          status={topStatus}
          rerun={<StageRerunButton slug="storyboard" rerun={storyboardRerun} variant="topbar" />}
          onPreview={() =>
            onOpenPreview(
              previewSectionId(activePage?.sections, activeQuiz?.quizIndex ?? null),
            )
          }
          previewDisabled={empty}
        />
    </>
  )

  return (
    <CanvasEditingProvider label={label} pageId={editingPageId} enabled={editingEnabled}>
    <div {...chrome} data-top-step="home" className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {topChrome}


      <div data-chrome="row" className="relative flex min-h-0 flex-1">
        <SideRail widthClass="w-64" empty={showEmptyPanel}>
          {showEmptyPanel ? (
            <PagesRailEmpty
              pageCount={state.pages.length}
              imageCount={state.imageCount}
              extracting={extractActivity.isActive}
            />
          ) : (
            <PagesRail
              label={label}
              pages={state.pages}
              quizzes={quizzes}
              activePageId={activePage?.pageId ?? null}
              activeQuizIndex={activeQuiz?.quizIndex ?? null}
              onSelect={selectPage}
              onSelectQuiz={setSelectedQuizIndex}
              storyboardRunning={storyboardActivity.isActive}
              outdatedPageIds={staleness.outdatedPageIds}
              tab={treeVariant === "rail" ? railTab : undefined}
              onTabChange={treeVariant === "rail" ? setRailTab : undefined}
              layers={
                treeVariant === "rail" ? (
                  <LayersTree label={label} pageId={editingPageId} sections={activePage?.sections ?? []} />
                ) : undefined
              }
            />
          )}
        </SideRail>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          data-chrome="center"
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden transition-[background-color] duration-300",
            "bg-accent",
          )}
        >
          {staleness.isStale && (
            <StoryboardStaleBanner
              rerun={storyboardRerun}
              outdatedCount={staleness.outdatedCount}
            />
          )}
          {showEmptyPanel ? (
            <CanvasEmptyPanel
              run={run}
              foundationRunning={foundationRunning}
              phase={phase}
              pageCount={state.pages.length}
              sectionCount={state.sectionCount}
              emptyRun={emptyRun}
              onOpenSettings={() => onOpenSettings("storyboard")}
              label={label}
              pages={state.pages}
            />
          ) : (
            (activeQuiz || activePage) && (
              <>
                {activeQuiz ? (
                  <QuizCanvas
                    label={label}
                    quiz={activeQuiz}
                    version={quizzesQuery.data?.version ?? null}
                    pages={state.pages}
                    viewport={viewport}
                    zoom={zoom}
                    onZoomChange={setZoom}
                  />
                ) : (
                  activePage && (
                    <PageCanvas
                      label={label}
                      page={activePage}
                      viewport={viewport}
                      zoom={zoom}
                      onZoomChange={setZoom}
                      sectioning={sectioningRun}
                      storyboardRunning={storyboardActivity.isActive}
                      onOpenSectioning={() => onOpenStep("sectioning")}
                    />
                  )
                )}
                {treeVariant === "floating" && editingPageId && (
                  <FloatingLayers label={label} pageId={editingPageId} sections={activePage?.sections ?? []} />
                )}
                {editorVariant === "floating" && <FloatingStyleInspector label={label} viewport={viewport} />}
                <CanvasSaveBar />
                <CanvasViewportControls
                  viewport={viewport}
                  onViewportChange={setViewport}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  chromeHidden={chromeHidden}
                  onToggleChrome={() => setChromeHidden((hidden) => !hidden)}
                />
              </>
            )
          )}
        </div>
        </div>

        {editorVariant === "panel" && <StyleSidePanel label={label} viewport={viewport} open={editingEnabled} />}
        <EditingAwareAiPanel
          editorOn={editorVariant === "panel"}
          label={label}
          pageId={activeQuiz ? null : activePage?.pageId ?? null}
          pageLabel={
            activeQuiz
              ? t`quiz ${activeQuiz.quizIndex + 1}`
              : activePage
                ? t`page ${activePage.pageNumber}`
                : undefined
          }
          sectionIndex={activePage?.sections[0]?.sectionIndex ?? 0}
          empty={empty}
          context="storyboard"
          sections={activeQuiz ? undefined : activePage?.sections}
        />
      </div>
    </div>
    </CanvasEditingProvider>
  )
}

function EditingAwareAiPanel({ editorOn, ...props }: React.ComponentProps<typeof AiEditPanel> & { editorOn: boolean }) {
  const { selection } = useCanvasEditing()
  return (
    <AiEditPanel
      {...props}
      suppressed={editorOn && !!selection}
      selectedSectionIndex={selection?.sectionIndex ?? null}
    />
  )
}

function FloatingStyleInspector({ label, viewport }: { label: string; viewport: React.ComponentProps<typeof StyleSidePanel>["viewport"] }) {
  const { selection } = useCanvasEditing()
  return (
    <div
      aria-hidden={!selection}
      className={cn(
        "absolute right-3 top-14 z-20 h-[calc(100%-180px)] overflow-hidden rounded-xl border bg-card shadow-[0_18px_40px_-20px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        selection ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0",
      )}
    >
      <StyleSidePanel label={label} viewport={viewport} open />
    </div>
  )
}

function FloatingLayers({
  label,
  pageId,
  sections,
}: {
  label: string
  pageId: string
  sections: React.ComponentProps<typeof LayersTree>["sections"]
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-140px)] w-64 flex-col overflow-hidden rounded-xl border bg-card/95 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md animate-in fade-in slide-in-from-left-2 duration-300">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-2 border-b px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Trans>Layers</Trans>
        <ChevronDown className={cn("ml-auto size-3.5 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      <div
        className={cn(
          "grid min-h-0 transition-[grid-template-rows] duration-250 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="flex min-h-0 flex-col overflow-hidden">
          <LayersTree label={label} pageId={pageId} sections={sections} className="max-h-[52vh]" />
        </div>
      </div>
    </div>
  )
}
