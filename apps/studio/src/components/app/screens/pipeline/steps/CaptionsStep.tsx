import { useCallback, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { PageDetail } from "@/api/client"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { usePages } from "@/hooks/use-pages"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepRail } from "./shared/ui"
import { usePageNav } from "./shared/usePageNav"
import { usePageParam } from "./shared/usePageParam"
import { usePageRailEntries } from "./shared/usePageRailEntries"
import { usePageView } from "./shared/pageview/usePageView"
import { createDraftStore, useDraftKeys } from "./shared/pageview/draftStore"
import { useStageSurface } from "./shared/useStageSurface"
import { CaptionsOverview } from "./captions/CaptionsOverview"
import { CaptionsPageDetail } from "./captions/CaptionsPageDetail"
import type { ItemFilter } from "./captions/CaptionList"
import { useCaptionSearch } from "./captions/useCaptionSearch"
import { pageMatchesCaptionFilter, useCaptionStats, type CaptionFilter } from "./captions/useCaptionStats"
import type { StepProps } from "./shared/types"

const missingCaptions = (page: PipelinePage) => page.imageCount > 0 && !page.hasCaptioning

export function CaptionsStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const run = useRunActivity()
  const activity = useStageActivity("captions")
  const pagesQuery = usePages(label)
  const view = usePageView()
  const [filter, setFilter] = useState<CaptionFilter>("all")
  const [search, setSearch] = useState("")
  const [draftStore] = useState(() => createDraftStore<CaptionEntry>())
  const keptPages = useDraftKeys(draftStore)

  const hasOutput = useMemo(() => pages.some((page) => page.hasCaptioning), [pages])
  const ready = useMemo(() => pages.some((page) => page.captionCount > 0), [pages])
  const totalImages = useMemo(() => pages.reduce((sum, page) => sum + page.imageCount, 0), [pages])

  const { openPage } = usePageParam(label, plugin.slug)
  const surface = useStageSurface({
    label,
    slug: "captions",
    hex: plugin.hex,
    pages,
    ready,
    outcome: t`Editing is paused until Image Captions finishes.`,
    hint: {
      title: t`How image descriptions work`,
      body: t`AI wrote a short description of every picture, so screen readers and translations can say what's in it. Edit any description, or mark an image as decorative so screen readers skip it. Saving creates a new version of that page, so you can always go back.`,
    },
    onOpenPage: openPage,
    markExtra: missingCaptions,
    onShowFailed: () => setFilter("failed"),
  })
  const { marks } = surface
  const showFailed = surface.failView.marks && marks.failedCount > 0
  const activeFilter: CaptionFilter = filter === "failed" && !showFailed ? "all" : filter

  const stats = useCaptionStats(pages, marks.isFailed)
  const railPages = useMemo(
    () => (activeFilter === "failed" ? stats.navPages.filter((page) => marks.isFailed(page.pageId)) : stats.navPages),
    [activeFilter, stats.navPages, marks],
  )
  const aspect = usePageAspect(label, stats.navPages)
  const nav = usePageNav({ label, slug: plugin.slug, pages: railPages, allPages: pages })

  const searchResult = useCaptionSearch(label, stats.navPages, search)
  const gridPages = useMemo(
    () =>
      stats.navPages.filter(
        (page) =>
          pageMatchesCaptionFilter(page, activeFilter, marks.isFailed) && (!searchResult.active || searchResult.matchesOn(page.pageId) > 0),
      ),
    [stats.navPages, activeFilter, marks, searchResult],
  )
  const feedPages = useMemo(() => {
    if (keptPages.size === 0) return gridPages
    const shown = new Set(gridPages.map((page) => page.pageId))
    return stats.navPages.filter((page) => shown.has(page.pageId) || keptPages.has(page.pageId))
  }, [gridPages, keptPages, stats.navPages])
  const isStale = useCallback(
    (pageId: string) => keptPages.has(pageId) && !gridPages.some((page) => page.pageId === pageId),
    [keptPages, gridPages],
  )
  const itemFilter: ItemFilter = activeFilter === "describe" || activeFilter === "decorative" ? activeFilter : "all"

  const firstCaption = useCallback(
    (page: PipelinePage) =>
      queryClient
        .getQueryData<PageDetail>(["books", label, "pages", page.pageId])
        ?.imageCaptioning?.captions.find((entry) => entry.decorative !== true && entry.caption.trim() !== "")?.caption,
    [queryClient, label],
  )
  const captionsOn = useCallback((page: PipelinePage) => page.captionCount, [])
  const railEntries = usePageRailEntries(label, railPages, {
    aspect,
    total: stats.total,
    allLabel: t`All images`,
    count: captionsOn,
    subtitle: firstCaption,
    failed: (page) => marks.isFailed(page.pageId),
  })

  const imagesLabel = t`${plural(stats.total, { one: "# image", other: "# images" })}`
  const loading = useStepLoading(props, { isLoading: pagesQuery.isPending, hasOutput })
  const runningView = useStepRunningView({
    ...props,
    stage: activity,
    isCancelling: run.isCancelling,
    onCancel: run.cancelRun,
    outcome: t`Descriptions show up here as each page is described.`,
  })
  const loadingView = useStepLoadingView(props)
  const emptyView = useStepEmptyView({
    ...props,
    prerequisites: totalImages === 0 ? [{ key: "images", met: false, label: t`Book has images to describe — none found` }] : undefined,
  })
  const phaseView = activity.isActive && !hasOutput ? runningView : loading ? loadingView : !hasOutput ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  const selected = nav.selected
  const notDone = marks.failedCount || (surface.problem?.pages.length ?? 0)

  return (
    <StepShell
      {...props}
      railEmpty={!selected}
      chips={[
        imagesLabel,
        surface.problem
          ? notDone > 0
            ? t`${plural(notDone, { one: "# page not done", other: "# pages not done" })}`
            : t`Didn't finish`
          : stats.toDescribe > 0
            ? t`${plural(stats.toDescribe, { one: "# to describe", other: "# to describe" })}`
            : t`All described`,
      ]}
      rail={
        <StepRail
          heading={<Trans>Images by page</Trans>}
          hex={plugin.hex}
          entries={railEntries}
          activeKey={selected?.pageId ?? ""}
          onSelect={(key) => (key ? nav.open(key) : nav.close())}
          footer={<Trans>Counts show how many images each page has.</Trans>}
        />
      }
    >
      {selected ? (
        <CaptionsPageDetail
          key={selected.pageId}
          label={label}
          pageId={selected.pageId}
          pageNumber={selected.pageNumber}
          hex={plugin.hex}
          locked={surface.locked}
          initialFilter={itemFilter}
          query={search}
          prevPageId={nav.prevId}
          nextPageId={nav.nextId}
          onStep={nav.step}
          onClose={nav.close}
        />
      ) : (
        <CaptionsOverview
          label={label}
          hex={plugin.hex}
          meta={imagesLabel}
          top={surface.top}
          help={surface.help}
          stats={stats}
          pages={gridPages}
          feedPages={feedPages}
          jumpPages={stats.navPages}
          isStale={isStale}
          store={draftStore}
          itemFilter={itemFilter}
          view={view}
          aspect={aspect}
          locked={surface.locked}
          filter={activeFilter}
          onFilter={setFilter}
          showFailed={showFailed}
          failedCount={marks.failedCount}
          isFailed={marks.isFailed}
          search={search}
          onSearch={setSearch}
          searchResult={searchResult}
          onOpenPage={nav.open}
        />
      )}
    </StepShell>
  )
}
