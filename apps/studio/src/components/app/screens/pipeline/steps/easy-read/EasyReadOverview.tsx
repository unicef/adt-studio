import { useCallback, type ReactNode } from "react"
import { RotateCcw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { useFeedPageInView } from "../captions/useFeedPageInView"
import { ListToolbar } from "../shared/list/ListToolbar"
import { NoMatches } from "../shared/list/NoMatches"
import { PageJumpInput } from "../shared/list/PageJumpInput"
import { PageFeed, type FeedRenderContext } from "../shared/pageview/PageFeed"
import { StepActionButton } from "../shared/StepActionButton"
import { StepSearch } from "../shared/StepSearch"
import { SaveError, StepBody } from "../shared/ui"
import { EasyReadFeedGroup } from "./EasyReadFeedGroup"
import type { EasyReadSectionsProps } from "./EasyReadSections"
import type { EasyReadFeedPage, EasyReadPages } from "./useEasyReadPages"

export interface EasyReadRegenerate {
  run: () => void
  disabledReason: string | null
}

export function EasyReadOverview({
  label,
  meta,
  top,
  help,
  data,
  jumpPages,
  aspect,
  search,
  onSearch,
  locked,
  saveError,
  regenerate,
  isFailed,
  isEdited,
  onUpdate,
  onOpenPage,
  onPreview,
}: {
  label: string
  meta: string
  top: ReactNode
  help: ReactNode
  data: EasyReadPages
  jumpPages: readonly PipelinePage[]
  aspect: PageAspect
  search: string
  onSearch: (value: string) => void
  locked: boolean
  saveError: Error | null
  regenerate: EasyReadRegenerate
  isFailed: (pageId: string) => boolean
  isEdited: EasyReadSectionsProps["isEdited"]
  onUpdate: EasyReadSectionsProps["onUpdate"]
  onOpenPage: (pageId: string) => void
  onPreview: (pageId: string) => void
}) {
  const { t } = useLingui()
  const pages = data.feedPages
  const inView = useFeedPageInView(true, pages)

  const renderGroup = useCallback(
    (page: EasyReadFeedPage, context: FeedRenderContext) => (
      <EasyReadFeedGroup
        label={label}
        page={page}
        thumbClassName={aspect.railThumbClassOf(page)}
        failed={isFailed(page.pageId)}
        context={context}
        locked={locked}
        isEdited={isEdited}
        onUpdate={onUpdate}
        onOpenPage={onOpenPage}
        onPreview={onPreview}
      />
    ),
    [label, aspect, isFailed, locked, isEdited, onUpdate, onOpenPage, onPreview],
  )

  const jumpTo = (pageId: string) => {
    const group = document.querySelector<HTMLElement>(`[data-feed-group="${CSS.escape(pageId)}"]`)
    if (!group) {
      onOpenPage(pageId)
      return
    }
    group.scrollIntoView({ block: "start" })
    group.querySelector<HTMLElement>("[data-feed-open]")?.focus({ preventScroll: true })
  }

  return (
    <StepBody
      width="wide"
      title={getStageLabelI18n("easy-read")}
      meta={meta}
      titleExtra={help}
      actions={
        <>
          <StepSearch
            value={search}
            onChange={onSearch}
            placeholder={t`Search original or Easy Read text…`}
            ariaLabel={t`Search original or Easy Read text…`}
            matches={{ shown: data.shown, total: data.total }}
          />
          <StepActionButton
            look="header"
            icon={RotateCcw}
            onClick={regenerate.run}
            disabled={!!regenerate.disabledReason}
            disabledReason={regenerate.disabledReason ?? undefined}
          >
            <Trans>Regenerate</Trans>
          </StepActionButton>
        </>
      }
    >
      {top}
      <ListToolbar
        right={
          <>
            <PageJumpInput pages={jumpPages} current={data.searching ? null : inView} onJump={(page) => jumpTo(page.pageId)} />
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {t`${plural(pages.length, { one: "# page", other: "# pages" })}`}
            </span>
          </>
        }
      />
      <SaveError error={saveError} />
      {pages.length === 0 ? (
        data.pending ? null : <NoMatches query={search} noun={t`blocks`} onClear={() => onSearch("")} />
      ) : (
        <PageFeed pages={pages} estimate={420} renderGroup={renderGroup} />
      )}
    </StepBody>
  )
}
