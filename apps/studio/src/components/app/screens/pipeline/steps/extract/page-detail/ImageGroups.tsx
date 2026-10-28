import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2, TriangleAlert, X } from "lucide-react"
import { Collapsible, CollapseChevron } from "../../shared/list/Collapsible"
import type { PageDetailData, PageImageEntry } from "./usePageDetailData"

export function ImagesSegmentError({ data }: { data: PageDetailData }) {
  const { t } = useLingui()
  const { images } = data
  if (!images.segmentError) return null
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
      <TriangleAlert className="size-3.5 shrink-0" />
      <span className="flex-1">{images.segmentError}</span>
      <button type="button" onClick={images.dismissSegmentError} aria-label={t`Close`} className="shrink-0 rounded p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10">
        <X className="size-3" />
      </button>
    </div>
  )
}

export function ImagesEmptyState({ data }: { data: PageDetailData }) {
  if (data.imageFilterRunning && !data.images.effective)
    return (
      <p role="status" className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        <Trans>Classifying images…</Trans>
      </p>
    )
  return (
    <p className="rounded-xl border border-dashed px-4 py-6 text-center text-[12.5px] text-muted-foreground">
      <Trans>No images were found on this page.</Trans>
    </p>
  )
}

export function ImageGroups({
  entries,
  activeId,
  renderGroup,
}: {
  entries: PageImageEntry[]
  activeId: string | null
  renderGroup: (items: PageImageEntry[]) => ReactNode
}) {
  const [showFiltered, setShowFiltered] = useState(false)
  const kept = entries.filter((entry) => !entry.isPruned)
  const filtered = entries.filter((entry) => entry.isPruned)
  const filteredOpen = showFiltered || (activeId != null && filtered.some((entry) => entry.imageId === activeId))

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">
          <Trans>Kept ({kept.length})</Trans>
        </p>
        {kept.length > 0 ? (
          renderGroup(kept)
        ) : (
          <p className="text-[12px] text-muted-foreground">
            <Trans>Nothing from this page is used as an image.</Trans>
          </p>
        )}
      </div>
      {filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={filteredOpen}
            onClick={() => setShowFiltered((value) => !value)}
            className="flex w-fit items-center gap-1.5 rounded-md text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Trans>Filtered out ({filtered.length})</Trans>
            <CollapseChevron open={filteredOpen} />
          </button>
          <Collapsible open={filteredOpen}>{renderGroup(filtered)}</Collapsible>
        </div>
      )}
    </>
  )
}
