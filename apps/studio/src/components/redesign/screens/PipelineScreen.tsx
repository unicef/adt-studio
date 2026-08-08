import { useMemo, useState } from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { CircleCheck, CircleAlert } from "lucide-react"
import { usePageTitle } from "@/hooks/use-page-title"
import { cn } from "@/lib/utils"
import { ScreenFallback } from "../ui/ScreenFallback"
import { AiEditPanel } from "./pipeline/AiEditPanel"
import { PageCanvas } from "./pipeline/PageCanvas"
import { PagesRail } from "./pipeline/PagesRail"
import { PagesRailEmpty } from "./pipeline/PagesRailEmpty"
import { PipelineTopBar } from "./pipeline/PipelineTopBar"
import { PluginDock } from "./pipeline/PluginDock"
import { StoryboardEmptyState } from "./pipeline/StoryboardEmptyState"
import { STEP_VIEWS, type StepFrame } from "./pipeline/steps"
import { findPlugin, isPluginSlug, type PluginSlug } from "./pipeline/plugins"
import type { Viewport } from "./pipeline/types"
import { usePipelineState } from "./pipeline/usePipelineState"

const route = getRouteApi("/redesign/pipeline/$label")

function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn"
  children: React.ReactNode
}) {
  const Icon = tone === "ok" ? CircleCheck : CircleAlert
  return (
    <span
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold",
        tone === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </span>
  )
}

export function PipelineScreen() {
  const { label } = route.useParams()
  const { plugin: pluginSlug } = route.useSearch()
  const navigate = useNavigate()
  const { t } = useLingui()

  const state = usePipelineState(label)
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)

  usePageTitle(state.book?.title ?? label)

  const activePage = useMemo(() => {
    if (state.pages.length === 0) return null
    return state.pages.find((p) => p.pageId === selectedPageId) ?? state.pages[0]
  }, [state.pages, selectedPageId])

  const openPlugin = (slug: string) => {
    if (!isPluginSlug(slug)) return
    navigate({ to: "/redesign/pipeline/$label", params: { label }, search: { plugin: slug } })
  }
  const closePlugin = () => {
    navigate({ to: "/redesign/pipeline/$label", params: { label }, search: {} })
  }

  if (state.isLoading || state.error || !state.book) {
    return <ScreenFallback error={state.error} />
  }

  const activePlugin = pluginSlug ? findPlugin(pluginSlug) : undefined

  if (activePlugin && isPluginSlug(activePlugin.slug)) {
    const slug: PluginSlug = activePlugin.slug
    const frame: StepFrame = {
      foundations: state.foundations,
      plugins: state.plugins,
      onBack: closePlugin,
      onOpenPlugin: openPlugin,
      extractDone: state.extractDone,
      hasSections: state.hasSections,
      sectionCount: state.pages.reduce((sum, p) => sum + p.sectionCount, 0),
    }
    const StepView = STEP_VIEWS[slug]

    return (
      <StepView
        key={slug}
        label={label}
        plugin={{ ...activePlugin, slug }}
        pages={state.pages}
        frame={frame}
      />
    )
  }

  const empty = !state.hasSections

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
          empty ? (
            <StatusPill tone="ok">
              {t`Extraction complete · ${state.pages.length} pages`}
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
          <PagesRailEmpty pageCount={state.pages.length} imageCount={state.imageCount} />
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
              <StoryboardEmptyState
                pageCount={state.pages.length}
                onGenerate={() => {}}
                onCreateManually={() => {}}
              />
            </div>
          ) : (
            activePage && <PageCanvas label={label} page={activePage} viewport={viewport} />
          )}

          <PluginDock
            className="absolute bottom-5.5 left-1/2 -translate-x-1/2"
            foundations={state.foundations}
            plugins={state.plugins}
            onOpenPlugin={openPlugin}
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
