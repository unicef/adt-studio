import { ImageGroups, ImagesEmptyState } from "./ImageGroups"
import { ImageThumb } from "./ImageThumb"
import type { BoxSelection } from "./useBoxSelection"
import type { PageDetailData, PageImageEntry } from "./usePageDetailData"

function thumbs(label: string, data: PageDetailData, selection: BoxSelection, items: PageImageEntry[], className: string) {
  return items.map((entry) => (
    <ImageThumb
      key={entry.imageId}
      label={label}
      entry={entry}
      cacheKey={data.images.cacheKey}
      active={entry.imageId === selection.hoverId}
      selected={entry.imageId === selection.selectedId}
      onHover={selection.hover}
      onSelect={selection.select}
      className={className}
    />
  ))
}

export function ImageThumbGrid({ label, data, selection }: { label: string; data: PageDetailData; selection: BoxSelection }) {
  if (data.entries.length === 0) return <ImagesEmptyState data={data} />
  return (
    <ImageGroups
      entries={data.entries}
      activeId={selection.activeId}
      renderGroup={(items) => (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">{thumbs(label, data, selection, items, "aspect-square")}</div>
      )}
    />
  )
}
