import { useEffect } from "react"
import { ArrowRight, CircleDashed, Image as ImageIcon } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { usePage } from "@/hooks/use-pages"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { cn } from "@/lib/utils"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { FeedGroup } from "../../shared/pageview/FeedGroup"
import type { DraftStore } from "../../shared/pageview/draftStore"
import { RefreshFailedNotice } from "../../shared/page-detail/RefreshFailedNotice"
import type { FeedRenderContext } from "../../shared/pageview/PageFeed"
import { StatusDot } from "../../shared/StatusDot"
import { CaptionList, type ItemFilter } from "../CaptionList"
import { CaptionsVersionPicker } from "../CaptionsVersionPicker"
import { useCaptionEdits } from "../useCaptionEdits"

export function CaptionsFeedGroup({
  label,
  page,
  hex,
  aspect,
  locked,
  failed,
  context,
  store,
  filter,
  query: search,
  stale,
  onOpenPage,
}: {
  label: string
  page: PipelinePage
  hex: string
  aspect: PageAspect
  locked: boolean
  failed: boolean
  context: FeedRenderContext
  store: DraftStore<CaptionEntry>
  filter: ItemFilter
  query: string
  stale: boolean
  onOpenPage: (pageId: string) => void
}) {
  const { t } = useLingui()
  const query = usePage(label, page.pageId, { enabled: context.near })
  const detail = query.data
  const edits = useCaptionEdits(label, page.pageId, detail, locked, store)
  const { onDirtyChange } = context

  useEffect(() => {
    onDirtyChange(edits.dirty)
  }, [edits.dirty, onDirtyChange])

  const header = (
    <header className="flex items-center gap-3">
      <PageThumb label={label} pageId={page.pageId} sectionIndex={null} className={aspect.railThumbClassOf(page)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Trans>Page {page.pageNumber}</Trans>
          {failed && <StatusDot tone="failed" label={t`Not done`} />}
        </span>
        <span className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-muted-foreground">
          <span className="flex items-center gap-1">
            <ImageIcon aria-hidden className="size-3" />
            {t`${plural(page.captionCount, { one: "# image", other: "# images" })}`}
          </span>
          <span className={cn("flex items-center gap-1", page.uncaptionedCount > 0 && "text-amber-700 dark:text-amber-400")}>
            <CircleDashed aria-hidden className="size-3" />
            {t`${plural(page.uncaptionedCount, { one: "# to describe", other: "# to describe" })}`}
          </span>
          {stale && <span className="font-sans text-muted-foreground">{t`Doesn't match the filter any more`}</span>}
        </span>
      </div>
      {detail?.imageCaptioning && (
        <CaptionsVersionPicker
          label={label}
          pageId={page.pageId}
          currentVersion={detail.versions.imageCaptioning}
          saving={edits.saving}
          dirty={edits.dirty}
          onRestored={edits.discard}
        />
      )}
      <button
        type="button"
        data-feed-open={page.pageId}
        aria-label={t`Open page ${page.pageNumber}`}
        onClick={() => onOpenPage(page.pageId)}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-foreground transition-colors duration-200 hover:bg-muted motion-reduce:transition-none"
      >
        <Trans>Open page</Trans>
        <ArrowRight aria-hidden className="size-3.5" />
      </button>
    </header>
  )

  return (
    <FeedGroup pageId={page.pageId} header={header} near={context.near} pinned={context.pinned} heights={context.heights}>
      {detail ? (
        <div className="flex flex-col gap-3">
          {query.isError && <RefreshFailedNotice pageNumber={page.pageNumber} onRetry={() => void query.refetch()} />}
          <CaptionList label={label} page={detail} hex={hex} edits={edits} locked={locked} filters={false} initialFilter={filter} query={search} />
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/30 px-4 py-3 text-[12.5px]">
          <span className="flex-1">
            <Trans>Couldn't load page {page.pageNumber}</Trans>
          </span>
          <button type="button" onClick={() => void query.refetch()} className="h-7 rounded-md border px-2 text-[12px] font-medium transition-colors hover:bg-muted">
            <Trans>Try again</Trans>
          </button>
        </div>
      ) : (
        <div aria-hidden className="h-52 rounded-xl border bg-muted/30 motion-safe:animate-pulse" />
      )}
    </FeedGroup>
  )
}
