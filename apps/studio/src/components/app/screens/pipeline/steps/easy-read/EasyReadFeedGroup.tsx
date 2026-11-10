import { memo } from "react"
import { ArrowRight } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { cn } from "@/lib/utils"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED } from "../shared/headerButton"
import { FeedGroup } from "../shared/pageview/FeedGroup"
import type { FeedRenderContext } from "../shared/pageview/PageFeed"
import { StatusDot } from "../shared/StatusDot"
import { entryCount, firstLine } from "./easyReadPages"
import { EasyReadSections, type EasyReadSectionsProps } from "./EasyReadSections"
import type { EasyReadFeedPage } from "./useEasyReadPages"

export const EasyReadFeedGroup = memo(function EasyReadFeedGroup({
  label,
  page,
  thumbClassName,
  failed,
  context,
  locked,
  isEdited,
  onUpdate,
  onOpenPage,
  onPreview,
}: {
  label: string
  page: EasyReadFeedPage
  thumbClassName: string
  failed: boolean
  context: FeedRenderContext
  locked: boolean
  isEdited: EasyReadSectionsProps["isEdited"]
  onUpdate: EasyReadSectionsProps["onUpdate"]
  onOpenPage: (pageId: string) => void
  onPreview: (pageId: string) => void
}) {
  const { t } = useLingui()
  const sections = page.blocks.length
  const entries = entryCount(page.blocks)
  const preview = firstLine(page.blocks)

  const header = (
    <header className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-sm">
      <button
        type="button"
        onClick={() => onPreview(page.pageId)}
        title={t`Open page preview`}
        aria-label={t`Open preview of page ${page.pageNumber}`}
        className="shrink-0 rounded-md outline-none transition-shadow duration-150 hover:ring-2 hover:ring-[color-mix(in_srgb,var(--chrome-hex)_40%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_55%,transparent)]"
      >
        <PageThumb label={label} pageId={page.pageId} sectionIndex={null} className={thumbClassName} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Trans>Page {page.pageNumber}</Trans>
          {failed && <StatusDot tone="failed" label={t`Not done`} />}
          <span className="font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
            {t`${plural(sections, { one: "# section", other: "# sections" })}`} · {t`${plural(entries, { one: "# block", other: "# blocks" })}`}
          </span>
        </span>
        {preview && <span className="line-clamp-1 text-[12px] text-muted-foreground">{preview.replace(/\n/g, " ")}</span>}
      </div>
      <button
        type="button"
        data-feed-open={page.pageId}
        aria-label={t`Open page ${page.pageNumber}`}
        onClick={() => onOpenPage(page.pageId)}
        className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED, "shrink-0 pl-3 text-foreground")}
      >
        <Trans>Open page</Trans>
        <ArrowRight aria-hidden className="size-3.5" />
      </button>
    </header>
  )

  return (
    <FeedGroup pageId={page.pageId} header={header} near={context.near} pinned={context.pinned} heights={context.heights}>
      <EasyReadSections
        blocks={page.blocks}
        layout="columns"
        locked={locked}
        isEdited={isEdited}
        onUpdate={onUpdate}
        className="overflow-hidden rounded-xl border bg-card"
      />
    </FeedGroup>
  )
})
