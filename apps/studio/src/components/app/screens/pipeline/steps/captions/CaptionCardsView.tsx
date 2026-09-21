import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PageDetail } from "@/api/client"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { CaptionCard } from "@/components/pipeline/stages/captions/components/CaptionCard"
import { Lightbox } from "@/components/pipeline/stages/captions/components/Lightbox"
import {
  buildImageSectionMap,
  matchesDecorativeFilter,
  matchesSearch,
} from "@/components/pipeline/stages/captions/lib/utils"
import type {
  CaptionEntry,
  CaptionGroup,
  DecorativeFilter,
  LightboxEntry,
} from "@/components/pipeline/stages/captions/lib/types"
import { SaveError, StepEmptyHint } from "../shared/ui"
import type { CaptionEdits } from "./useCaptionEdits"

const GRID_CLASS = "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"

export function CaptionCardsView({
  label,
  pageId,
  page,
  accent,
  edits,
  filter,
  search,
  onClearFilters,
}: {
  label: string
  pageId: string
  page: PageDetail
  accent: string
  edits: CaptionEdits
  filter: DecorativeFilter
  search: string
  onClearFilters?: () => void
}) {
  const { t } = useLingui()
  const [lightbox, setLightbox] = useState<{ imageIds: string[]; index: number } | null>(null)

  const [lightboxPageId, setLightboxPageId] = useState(pageId)
  if (lightboxPageId !== pageId) {
    setLightboxPageId(pageId)
    setLightbox(null)
  }

  const visibleCaptions = useMemo(
    () =>
      edits.captions.filter(
        (c) => matchesDecorativeFilter(c, filter) && matchesSearch(c, search),
      ),
    [edits.captions, filter, search],
  )

  const imageSectionMap = useMemo(() => buildImageSectionMap(page), [page])

  const groups = useMemo(() => {
    const sections = page.sectioningTree?.sections
    if (!sections || sections.length <= 1) return null
    const grouped = new Map<number, CaptionGroup>()
    const unsectioned: CaptionEntry[] = []
    for (const cap of visibleCaptions) {
      const sectionIndex = imageSectionMap.get(cap.imageId)
      if (sectionIndex != null) {
        let group = grouped.get(sectionIndex)
        if (!group) {
          group = { sectionIndex, sectionType: sections[sectionIndex]?.sectionType, captions: [] }
          grouped.set(sectionIndex, group)
        }
        group.captions.push(cap)
      } else {
        unsectioned.push(cap)
      }
    }
    const result = [...grouped.values()].sort((a, b) => a.sectionIndex - b.sectionIndex)
    if (unsectioned.length > 0) {
      result.push({ sectionIndex: -1, sectionType: undefined, captions: unsectioned })
    }
    return result
  }, [visibleCaptions, imageSectionMap, page.sectioningTree?.sections])

  const openLightbox = useCallback((entries: LightboxEntry[], index: number) => {
    setLightbox({ imageIds: entries.map((entry) => entry.cap.imageId), index })
  }, [])

  const lightboxEntries: LightboxEntry[] = lightbox
    ? lightbox.imageIds
        .map((id) => {
          const cap = edits.captions.find((c) => c.imageId === id)
          return cap ? { cap, pageId, pageNumber: page.pageNumber } : null
        })
        .filter((entry): entry is LightboxEntry => entry != null)
    : []

  const filtersActive = filter !== "all" || search.trim().length > 0

  const renderCard = (cap: CaptionEntry, list: CaptionEntry[]) => (
    <CaptionCard
      key={cap.imageId}
      bookLabel={label}
      cap={cap}
      list={list}
      editing={edits.editing?.imageId === cap.imageId ? edits.editing : null}
      onStartEdit={edits.startEdit}
      onChangeDraft={edits.changeDraft}
      onCommitEdit={edits.commitEdit}
      onCancelEdit={edits.cancelEdit}
      onToggleDecorative={edits.toggleDecorative}
      onOpenLightbox={openLightbox}
      pageId={pageId}
      pageNumber={page.pageNumber}
    />
  )

  return (
    <>
      <SaveError error={edits.saveError} />

      {visibleCaptions.length === 0 ? (
        <StepEmptyHint>
          <span className="flex flex-col items-center gap-2">
            {search.trim() ? (
              <Trans>No captions match your search.</Trans>
            ) : (
              <Trans>No captions match these filters.</Trans>
            )}
            {filtersActive && onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="font-medium underline-offset-2 hover:underline"
                style={{ color: accent }}
              >
                <Trans>Clear filters</Trans>
              </button>
            )}
          </span>
        </StepEmptyHint>
      ) : groups ? (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.sectionIndex} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 pl-0.5">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: tint(accent, 0.12), color: accent }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: accent }} />
                  {group.sectionIndex >= 0 ? (
                    group.sectionType ? (
                      <Trans>Section {group.sectionIndex + 1} — {group.sectionType}</Trans>
                    ) : (
                      <Trans>Section {group.sectionIndex + 1}</Trans>
                    )
                  ) : (
                    <Trans>Other images</Trans>
                  )}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {t`${group.captions.length} images`}
                </span>
              </div>
              <div className={GRID_CLASS}>
                {group.captions.map((cap) => renderCard(cap, group.captions))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={GRID_CLASS}>
          {visibleCaptions.map((cap) => renderCard(cap, visibleCaptions))}
        </div>
      )}

      {lightbox && lightboxEntries.length > 0 && (
        <Lightbox
          bookLabel={label}
          entries={lightboxEntries}
          index={Math.min(lightbox.index, lightboxEntries.length - 1)}
          dirty={edits.dirty}
          saving={edits.saving}
          onClose={() => setLightbox(null)}
          onNavigate={(next) => setLightbox((prev) => (prev ? { ...prev, index: next } : prev))}
          onCaptionChange={(entry, newCaption) => edits.applyCaption(entry.cap.imageId, newCaption)}
          onToggleDecorative={(entry) => edits.toggleDecorative(entry.cap.imageId)}
          onSave={edits.saveCaptions}
          onDiscard={edits.discard}
        />
      )}
    </>
  )
}
