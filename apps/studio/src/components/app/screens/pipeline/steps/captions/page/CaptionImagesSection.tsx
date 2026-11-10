import { Trans } from "@lingui/react/macro"
import { Image as ImageIcon } from "lucide-react"
import { PageSection } from "../../shared/page-inspector/PageSection"
import { SeeMoreButton } from "../../shared/page-inspector/SeeMoreButton"
import type { SectionMore } from "../../shared/page-inspector/useInspectorSheet"
import type { BoxSelection } from "../../shared/page-inspector/useBoxSelection"
import { SaveError } from "../../shared/ui"
import { CaptionFilterBar, CaptionFilterEmpty } from "../CaptionFilterBar"
import type { CaptionEdits } from "../useCaptionEdits"
import type { CaptionFilters } from "../useCaptionFilters"
import { CaptionCompactItem } from "./CaptionCompactItem"
import { ImagesTitle } from "./ImagesTitle"

export const CAPTION_PREVIEW = 4

export function CaptionImagesSection({
  label,
  hex,
  edits,
  filters,
  numberOf,
  selection,
  locked,
  versionPicker,
  more,
  onOpen,
}: {
  label: string
  hex: string
  edits: CaptionEdits
  filters: CaptionFilters
  numberOf: ReadonlyMap<string, number>
  selection: BoxSelection
  locked: boolean
  versionPicker: React.ReactNode
  more: SectionMore
  onOpen: (imageId: string) => void
}) {
  if (edits.items.length === 0)
    return <PageSection icon={ImageIcon} title={<Trans>Images</Trans>} empty={<Trans>This page has no images to describe.</Trans>} />

  const items = filters.shown.items
  const selectedIndex = items.findIndex((entry) => entry.imageId === selection.selectedId)
  const preview = selectedIndex >= CAPTION_PREVIEW ? [...items.slice(0, CAPTION_PREVIEW - 1), items[selectedIndex]] : items.slice(0, CAPTION_PREVIEW)
  const hidden = Math.max(0, items.length - preview.length)

  return (
    <PageSection
      icon={ImageIcon}
      title={<ImagesTitle filters={filters} />}
      aside={
        <>
          {edits.autoSave && (
            <span className="text-[11px] text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
              <Trans>Saves automatically</Trans>
            </span>
          )}
          {versionPicker}
        </>
      }
    >
      <CaptionFilterBar filters={filters} hex={hex} />
      <SaveError error={edits.saveError} />
      {items.length === 0 ? (
        <CaptionFilterEmpty filters={filters} />
      ) : (
        <div className="flex flex-col gap-2">
          {preview.map((entry) => (
            <CaptionCompactItem
              key={entry.imageId}
              label={label}
              entry={entry}
              number={numberOf.get(entry.imageId) ?? 0}
              source={filters.sourceOf.get(entry.imageId)}
              edited={edits.editedKeys.has(entry.imageId)}
              locked={locked}
              stale={filters.shown.stale.has(entry.imageId)}
              active={entry.imageId === selection.hoverId}
              selected={entry.imageId === selection.selectedId}
              onCaption={edits.setCaption}
              onDecorative={edits.setDecorative}
              onOpen={onOpen}
              onHover={selection.hover}
              onSelect={selection.select}
              saveState={edits.saveStates.get(entry.imageId) ?? null}
              onUndo={edits.undo}
            />
          ))}
        </div>
      )}
      {(hidden > 0 || items.length > 0) && (
        <SeeMoreButton count={hidden > 0 ? hidden : undefined} open={more.open} onClick={more.onMore} buttonRef={more.buttonRef} />
      )}
    </PageSection>
  )
}
