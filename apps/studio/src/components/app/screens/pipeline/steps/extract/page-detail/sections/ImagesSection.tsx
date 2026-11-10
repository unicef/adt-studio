import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Image as ImageIcon, LayoutTemplate } from "lucide-react"
import { isPageElements } from "../humanReason"
import { Collapsible, CollapseChevron } from "../../../shared/list/Collapsible"
import { noImagesLine } from "../emptyCopy"
import { ImageCompactRow } from "../ImageCompactRow"
import { ImagesSegmentError } from "../ImageGroups"
import { ImagesVersion } from "../ImagesVersion"
import { PageSection } from "@/components/app/screens/pipeline/steps/shared/page-inspector/PageSection"
import { SelectedImage } from "../SelectedImage"
import type { BoxSelection } from "@/components/app/screens/pipeline/steps/shared/page-inspector/useBoxSelection"
import type { PageDetailData, PageImageEntry } from "../usePageDetailData"
import { SeeMoreButton } from "@/components/app/screens/pipeline/steps/shared/page-inspector/SeeMoreButton"
import type { SectionMore } from "./types"

export const IMAGE_PREVIEW = 6

export function ImagesSection({
  label,
  pageId,
  data,
  selection,
  more,
}: {
  label: string
  pageId: string
  data: PageDetailData
  selection: BoxSelection
  more: SectionMore
}) {
  const { t } = useLingui()
  const [showFiltered, setShowFiltered] = useState(false)
  const kept = data.entries.filter((entry) => !entry.isPruned)
  const filtered = data.entries.filter((entry) => entry.isPruned)
  const pageElements = filtered.filter((entry) => isPageElements(entry.reason)).length
  const filteredOpen = showFiltered || filtered.some((entry) => entry.imageId === selection.activeId)
  const hiddenKept = Math.max(0, kept.length - IMAGE_PREVIEW)

  if (data.entries.length === 0) return <PageSection icon={ImageIcon} title={<Trans>Images</Trans>} empty={noImagesLine(data)} />

  const rows = (items: PageImageEntry[]) => (
    <div className="flex flex-col">
      {items.map((entry) => (
        <ImageCompactRow
          key={entry.imageId}
          label={label}
          entry={entry}
          cacheKey={data.images.cacheKey}
          active={entry.imageId === selection.hoverId}
          selected={entry.imageId === selection.selectedId}
          onHover={selection.hover}
          onSelect={selection.select}
          onTogglePrune={data.images.togglePrune}
        />
      ))}
    </div>
  )

  return (
    <PageSection icon={ImageIcon} title={<Trans>Images · {data.entries.length}</Trans>} aside={<ImagesVersion label={label} pageId={pageId} data={data} compact />}>
      <ImagesSegmentError data={data} />
      <SelectedImage label={label} data={data} selection={selection} />
      {kept.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-[12px] font-medium text-muted-foreground">
            <Trans>Kept ({kept.length})</Trans>
          </p>
          {rows(kept.slice(0, IMAGE_PREVIEW))}
          {hiddenKept > 0 && <SeeMoreButton count={hiddenKept} open={more.open} onClick={more.onMore} buttonRef={more.buttonRef} />}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          <Trans>Nothing from this page is used as an image.</Trans>
        </p>
      )}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={filteredOpen}
            onClick={() => setShowFiltered((value) => !value)}
            className="flex h-7 w-fit items-center gap-1.5 rounded-md text-[12px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]"
          >
            <Trans>Filtered out ({filtered.length})</Trans>
            <CollapseChevron open={filteredOpen} />
            {pageElements > 0 && (
              <span className="ml-1 flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--chrome-hex)_12%,transparent)] px-1.5 py-px text-[11px] font-semibold text-[var(--chrome-hex)]">
                <LayoutTemplate className="size-3" aria-hidden />
                {t`${plural(pageElements, { one: "# becomes page elements", other: "# become page elements" })}`}
              </span>
            )}
          </button>
          <Collapsible open={filteredOpen}>{rows(filtered)}</Collapsible>
        </div>
      )}
    </PageSection>
  )
}
