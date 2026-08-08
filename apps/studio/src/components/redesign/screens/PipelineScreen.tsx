import { useMemo, useState } from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { CircleCheck, CircleAlert, Loader2 } from "lucide-react"
import { usePageTitle } from "@/hooks/use-page-title"
import { getSettingsTabs } from "@/components/pipeline/settings-tabs"
import { cn } from "@/lib/utils"
import { ScreenFallback } from "../ui/ScreenFallback"
import { AiEditPanel } from "./pipeline/AiEditPanel"
import { PageCanvas } from "./pipeline/PageCanvas"
import { PagesRail } from "./pipeline/PagesRail"
import { PagesRailEmpty } from "./pipeline/PagesRailEmpty"
import { PipelineTopBar } from "./pipeline/PipelineTopBar"
import { PluginDock } from "./pipeline/PluginDock"
import { StageRunningPanel } from "./pipeline/StageRunningPanel"
import { StoryboardEmptyState, type StoryboardPhase } from "./pipeline/StoryboardEmptyState"
import { STEP_VIEWS, type StepFrame } from "./pipeline/steps"
import { findDockEntry, isDockSlug, type DockSlug } from "./pipeline/plugins"
import type { Viewport } from "./pipeline/types"
import { usePipelineState } from "./pipeline/usePipelineState"
import { useRunActivity, useStageActivity } from "./pipeline/useRunActivity"
import { useSectioningRun } from "./pipeline/useSectioningRun"
import { useStoryboardRun } from "./pipeline/useStoryboardRun"

const route = getRouteApi("/redesign/pipeline/$label")

const PILL_TONES = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  warn: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  running: "border-brand-200 bg-brand-50 text-brand-700",
} as const

function StatusPill({
  tone,
  children,
}: {
  tone: keyof typeof PILL_TONES
  children: React.ReactNode
}) {
  const Icon = tone === "ok" ? CircleCheck : tone === "warn" ? CircleAlert : Loader2
  return (
    <span
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold",
        PILL_TONES[tone],
      )}
    >
      <Icon className={cn("size-3.5", tone === "running" && "animate-spin")} />
      {children}
    </span>
  )
}

export function PipelineScreen() {
  const { label } = route.useParams()
  const { step: stepSlug } = route.useSearch()
  const navigate = useNavigate()
  const { t, i18n } = useLingui()

  const state = usePipelineState(label)
  const run = useRunActivity()
  const extractActivity = useStageActivity("extract")
  const sectioningActivity = useStageActivity("sectioning")
  const storyboardActivity = useStageActivity("storyboard")
  const sectioningRun = useSectioningRun(label)
  const storyboardRun = useStoryboardRun(label)
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)

  usePageTitle(state.book?.title ?? label)

  const activePage = useMemo(() => {
    if (state.pages.length === 0) return null
    return state.pages.find((p) => p.pageId === selectedPageId) ?? state.pages[0]
  }, [state.pages, selectedPageId])

  const openStep = (slug: string) => {
    if (!isDockSlug(slug)) return
    navigate({ to: "/redesign/pipeline/$label", params: { label }, search: { step: slug } })
  }
  const closeStep = () => {
    navigate({ to: "/redesign/pipeline/$label", params: { label }, search: {} })
  }
  const openSettings = (slug: string) => {
    navigate({
      to: "/books/$label/$step/settings",
      params: { label, step: slug },
      search: { tab: getSettingsTabs(slug, i18n, false)?.[0]?.key ?? "general" },
    })
  }

  if (state.isLoading || state.error || !state.book) {
    return <ScreenFallback error={state.error} />
  }

  const activeStep = stepSlug ? findDockEntry(stepSlug) : undefined

  if (activeStep && isDockSlug(activeStep.slug)) {
    const slug: DockSlug = activeStep.slug
    const frame: StepFrame = {
      foundations: state.foundations,
      plugins: state.plugins,
      onBack: closeStep,
      onOpenPlugin: openStep,
      onOpenSettings: openSettings,
      extractDone: state.extractDone,
      hasSections: state.hasSections,
      sectionCount: state.sectionCount,
    }
    const StepView = STEP_VIEWS[slug]

    return (
      <StepView
        key={slug}
        label={label}
        plugin={{ ...activeStep, slug }}
        pages={state.pages}
        frame={frame}
      />
    )
  }

  const empty = !state.hasSections || !state.hasRendering
  const phase: StoryboardPhase = state.hasSections ? "render" : "sections"
  const emptyRun = phase === "render" ? storyboardRun : sectioningRun
  const runningStage = run.activeStages.find((s) => s.state === "running") ?? run.activeStages[0]
  const foundationRunning = extractActivity.isActive
    ? extractActivity
    : sectioningActivity.isActive
      ? sectioningActivity
      : storyboardActivity.isActive
        ? storyboardActivity
        : null

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <PipelineTopBar
        label={label}
        pageLabel={empty || !activePage ? undefined : t`Page ${activePage.pageNumber}`}
        version={empty ? null : activePage?.renderingVersion ?? null}
        viewport={viewport}
        onViewportChange={setViewport}
        disabled={empty}
        status={
          runningStage ? (
            <StatusPill tone="running">
              <span className="truncate">
                {runningStage.state === "queued" ? runningStage.label : runningStage.runningLabel}
              </span>
              {runningStage.current?.progress && (
                <span className="font-mono text-[11px] font-medium tabular-nums">
                  {runningStage.current.progress}
                </span>
              )}
            </StatusPill>
          ) : empty ? (
            <StatusPill tone="ok">
              {phase === "render"
                ? t`Sectioning complete · ${state.sectionCount} sections`
                : t`Extraction complete · ${state.pages.length} pages`}
            </StatusPill>
          ) : state.missingCaptions > 0 ? (
            <StatusPill tone="warn">
              {t`Review queue · ${state.missingCaptions}`}
            </StatusPill>
          ) : (
            <StatusPill tone="ok">
              <Trans>Nothing pending review</Trans>
            </StatusPill>
          )
        }
      />

      <div className="flex min-h-0 flex-1">
        {empty ? (
          <PagesRailEmpty
            pageCount={state.pages.length}
            imageCount={state.imageCount}
            extracting={extractActivity.isActive}
          />
        ) : (
          <PagesRail
            label={label}
            pages={state.pages}
            activePageId={activePage?.pageId ?? null}
            onSelect={setSelectedPageId}
          />
        )}

        <div className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden">
          {empty ? (
            <div className="flex flex-1 items-center pb-24">
              {foundationRunning ? (
                <StageRunningPanel
                  stage={foundationRunning}
                  isCancelling={run.isCancelling}
                  onCancel={run.cancelRun}
                  outcome={
                    foundationRunning.slug === "extract"
                      ? t`Pages and images show up in the left rail as each page is extracted.`
                      : foundationRunning.slug === "sectioning"
                        ? t`Sections show up in the left rail as each page is structured.`
                        : t`Rendered pages replace this panel as each page is built.`
                  }
                />
              ) : (
                <StoryboardEmptyState
                  phase={phase}
                  pageCount={state.pages.length}
                  sectionCount={state.sectionCount}
                  onGenerate={emptyRun.run}
                  onCreateManually={() => {}}
                  onOpenSettings={() => openSettings("storyboard")}
                  canGenerate={emptyRun.canRun}
                  disabledReason={
                    emptyRun.hasApiKey ? undefined : phase === "render" ? (
                      <Trans>Add an API key in Book settings to run the storyboard.</Trans>
                    ) : (
                      <Trans>Add an API key in Book settings to run sectioning.</Trans>
                    )
                  }
                />
              )}
            </div>
          ) : (
            activePage && <PageCanvas label={label} page={activePage} viewport={viewport} />
          )}

          <PluginDock
            className="absolute bottom-5.5 left-1/2 -translate-x-1/2"
            foundations={state.foundations}
            plugins={state.plugins}
            onOpenPlugin={openStep}
            hint={empty ? <Trans>Plugins unlock once the sections exist</Trans> : undefined}
          />
        </div>

        <AiEditPanel
          label={label}
          pageId={activePage?.pageId ?? null}
          pageLabel={activePage ? t`page ${activePage.pageNumber}` : undefined}
          sectionIndex={activePage?.sections[0]?.sectionIndex ?? 0}
          empty={empty}
        />
      </div>
    </div>
  )
}
