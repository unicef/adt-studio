import { useEffect } from "react"
import { ArrowRight, CircleDashed, Image as ImageIcon } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { usePage } from "@/hooks/use-pages"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { cn } from "@/lib/utils"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED } from "../../shared/headerButton"

const PICKER_TRIGGER = cn("h-6 gap-1 rounded-md border bg-card px-1.5 text-[11.5px]! font-semibold! text-foreground hover:bg-muted")
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { FeedGroup } from "../../shared/pageview/FeedGroup"
import type { DraftStore } from "../../shared/pageview/draftStore"
import { PageLoadError, PageRefreshFailed } from "../../shared/page-detail/PageNotices"
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
  const edits = useCaptionEdits(label, page.pageId, detail, locked, store, hex)
  const { onDirtyChange } = context
  const described = Math.max(0, page.captionCount - page.uncaptionedCount - page.decorativeCount)
  const matching = filter === "describe" ? page.uncaptionedCount : filter === "captioned" ? described : filter === "decorative" ? page.decorativeCount : page.captionCount

  useEffect(() => {
    onDirtyChange(edits.dirty)
  }, [edits.dirty, onDirtyChange])

  const header = (
    <header className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-sm">
      <PageThumb label={label} pageId={page.pageId} sectionIndex={null} className={aspect.railThumbClassOf(page)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Trans>Page {page.pageNumber}</Trans>
          {failed && <StatusDot tone="failed" label={t`Not done`} />}
          <span className="flex items-center gap-3 font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
            <span className="flex items-center gap-1">
              <ImageIcon aria-hidden className="size-3" />
              {filter === "all" ? t`${plural(page.captionCount, { one: "# image", other: "# images" })}` : t`${matching} of ${page.captionCount} images`}
            </span>
            {page.uncaptionedCount > 0 && (
              <span className="flex items-center gap-1 text-[color-mix(in_oklab,var(--chrome-hex)_80%,black)] dark:text-[color-mix(in_oklab,var(--chrome-hex)_70%,white)]">
                <CircleDashed aria-hidden className="size-3" />
                {t`${plural(page.uncaptionedCount, { one: "# to describe", other: "# to describe" })}`}
              </span>
            )}
          </span>
        </span>
        {page.textPreview.trim() && <span className="line-clamp-1 text-[12px] text-muted-foreground">{page.textPreview.replace(/\n/g, " ")}</span>}
        {stale && <span className="text-[11px] text-muted-foreground">{t`Doesn't match the filter any more`}</span>}
      </div>
      {detail?.imageCaptioning && (
        <CaptionsVersionPicker
          label={label}
          pageId={page.pageId}
          currentVersion={detail.versions.imageCaptioning}
          saving={edits.saving}
          dirty={edits.dirty}
          onRestored={edits.discard}
          triggerClassName={PICKER_TRIGGER}
          triggerLabel={detail.versions.imageCaptioning != null ? t`Description version ${detail.versions.imageCaptioning}. Change version` : undefined}
        />
      )}
      <button
        type="button"
        data-feed-open={page.pageId}
        aria-label={t`Open page ${page.pageNumber}`}
        onClick={() => onOpenPage(page.pageId)}
        className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED, "pl-3 text-foreground")}
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
          {query.isError && <PageRefreshFailed pageNumber={page.pageNumber} hex={hex} onRetry={() => void query.refetch()} />}
          <CaptionList label={label} page={detail} hex={hex} edits={edits} locked={locked} filters={false} initialFilter={filter} query={search} />
        </div>
      ) : query.isError ? (
        <PageLoadError pageNumber={page.pageNumber} onRetry={() => void query.refetch()} />
      ) : (
        <div aria-hidden className="h-52 rounded-xl border bg-muted/30 motion-safe:animate-pulse" />
      )}
    </FeedGroup>
  )
}
