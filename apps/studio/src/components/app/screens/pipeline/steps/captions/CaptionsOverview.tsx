import { useCallback, useMemo, type ReactNode } from "react"
import { CircleDashed, EyeOff, Image as ImageIcon, Search } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { ListToolbar } from "../shared/list/ListToolbar"
import { PageJumpInput } from "../shared/list/PageJumpInput"
import type { DraftStore } from "../shared/pageview/draftStore"
import { NoMatches } from "../shared/list/NoMatches"
import { PageFeed, type FeedRenderContext } from "../shared/pageview/PageFeed"
import type { PageView } from "../shared/pageview/usePageView"
import { StatusDot } from "../shared/StatusDot"
import { StepFilterTabs, type StepFilterOption } from "../shared/StepFilterTabs"
import { StepPageGrid } from "../shared/StepPageGrid"
import { StepSearch } from "../shared/StepSearch"
import { StepBody, StepEmptyHint } from "../shared/ui"
import type { ItemFilter } from "./CaptionList"
import { CaptionPreview } from "./CaptionPreview"
import type { CaptionSearch } from "./useCaptionSearch"
import type { CaptionFilter, CaptionStats } from "./useCaptionStats"
import { CaptionsFeedGroup } from "./variants/CaptionsFeedGroup"

export interface CaptionsOverviewProps {
  label: string
  hex: string
  meta: string
  top: ReactNode
  help: ReactNode
  stats: CaptionStats
  pages: readonly PipelinePage[]
  feedPages: readonly PipelinePage[]
  jumpPages: readonly PipelinePage[]
  isStale: (pageId: string) => boolean
  store: DraftStore<CaptionEntry>
  itemFilter: ItemFilter
  view: PageView
  aspect: PageAspect
  locked: boolean
  filter: CaptionFilter
  onFilter: (value: CaptionFilter) => void
  showFailed: boolean
  failedCount: number
  isFailed: (pageId: string) => boolean
  search: string
  onSearch: (value: string) => void
  searchResult: CaptionSearch
  onOpenPage: (pageId: string) => void
}

export function CaptionsOverview(props: CaptionsOverviewProps) {
  const { t } = useLingui()
  const { label, hex, stats, pages, aspect, isFailed, locked, onOpenPage, store, itemFilter, isStale } = props
  const searchResult = props.searchResult
  const query = props.search

  const options = useMemo(() => {
    const list: StepFilterOption<CaptionFilter>[] = [
      { value: "all", label: t`All`, count: stats.total },
      { value: "describe", label: t`To describe`, count: stats.toDescribe },
      { value: "decorative", label: t`Decorative`, count: stats.decorative },
    ]
    if (props.showFailed) list.push({ value: "failed", label: t`Failed`, count: props.failedCount, tone: "danger" })
    return list
  }, [t, stats, props.showFailed, props.failedCount])

  const cardOf = useCallback(
    (page: PipelinePage) => ({
      failed: isFailed(page.pageId),
      stats: [
        { key: "images", icon: ImageIcon, value: page.captionCount, label: t`${plural(page.captionCount, { one: "# image", other: "# images" })}` },
        {
          key: "describe",
          icon: CircleDashed,
          value: page.uncaptionedCount,
          label: t`${plural(page.uncaptionedCount, { one: "# image to describe", other: "# images to describe" })}`,
          tone: page.uncaptionedCount > 0 ? ("attention" as const) : ("default" as const),
        },
        ...(page.decorativeCount > 0
          ? [{ key: "decorative", icon: EyeOff, value: page.decorativeCount, label: t`${plural(page.decorativeCount, { one: "# decorative image", other: "# decorative images" })}` }]
          : []),
        ...(searchResult.active
          ? [{ key: "matches", icon: Search, value: searchResult.matchesOn(page.pageId), label: t`${plural(searchResult.matchesOn(page.pageId), { one: "# image matches", other: "# images match" })}` }]
          : []),
      ].slice(-3),
      status:
        page.uncaptionedCount === 0 ? (
          <StatusDot tone="done" label={t`Every image is described`} />
        ) : (
          <StatusDot tone="attention" label={t`Some images still need a description`} />
        ),
      preview: <CaptionPreview label={label} pageId={page.pageId} />,
    }),
    [t, label, isFailed, searchResult],
  )

  const renderGroup = useCallback(
    (page: PipelinePage, context: FeedRenderContext) => (
      <CaptionsFeedGroup
        label={label}
        page={page}
        hex={hex}
        aspect={aspect}
        locked={locked}
        failed={isFailed(page.pageId)}
        context={context}
        store={store}
        filter={itemFilter}
        query={query}
        stale={isStale(page.pageId)}
        onOpenPage={onOpenPage}
      />
    ),
    [label, hex, aspect, locked, isFailed, onOpenPage, store, itemFilter, query, isStale],
  )

  const searching = searchResult.active
  const feed = props.view === "items"
  const shownCount = (feed ? props.feedPages : pages).length
  const empty = shownCount === 0

  const jumpTo = (pageId: string) => {
    const group = feed ? document.querySelector<HTMLElement>(`[data-feed-group="${pageId}"]`) : null
    if (!group) {
      onOpenPage(pageId)
      return
    }
    group.scrollIntoView({ block: "start" })
    group.querySelector<HTMLElement>("[data-feed-open]")?.focus({ preventScroll: true })
  }

  return (
    <StepBody
      width="full"
      title={getStageLabelI18n("captions")}
      meta={props.meta}
      titleExtra={props.help}
      actions={
        <StepSearch
          value={props.search}
          onChange={props.onSearch}
          placeholder={t`Search descriptions…`}
          ariaLabel={t`Search descriptions and image IDs`}
          matches={{ shown: props.searchResult.shown, total: stats.total }}
        />
      }
    >
      {props.top}
      <ListToolbar
        left={<StepFilterTabs ariaLabel={t`Show pages with`} accent={hex} value={props.filter} onChange={props.onFilter} options={options} />}
        right={
          <>
            <PageJumpInput pages={props.jumpPages} onJump={(page) => jumpTo(page.pageId)} />
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {t`${plural(shownCount, { one: "# page", other: "# pages" })}`}
            </span>
          </>
        }
      />
      {empty ? (
        searching ? (
          props.searchResult.pending ? null : <NoMatches query={props.search} noun={t`descriptions`} onClear={() => props.onSearch("")} />
        ) : (
          <StepEmptyHint>{props.filter === "describe" ? t`Every image has a description.` : t`No pages match this filter.`}</StepEmptyHint>
        )
      ) : props.view === "items" ? (
        <PageFeed pages={props.feedPages} estimate={300} renderGroup={renderGroup} />
      ) : (
        <StepPageGrid label={label} pages={pages} aspect={aspect} onOpen={onOpenPage} cardOf={cardOf} />
      )}
    </StepBody>
  )
}
