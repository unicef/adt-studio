import { useCallback, useState } from "react"
import type { PageDetail } from "@/api/client"
import { SaveError } from "../shared/ui"
import { CaptionCards } from "./CaptionCards"
import { CaptionFilterBar, CaptionFilterEmpty } from "./CaptionFilterBar"
import { CaptionLightbox } from "./CaptionLightbox"
import type { CaptionEdits } from "./useCaptionEdits"
import { useCaptionFilters, type ItemFilter } from "./useCaptionFilters"

export type { ItemFilter } from "./useCaptionFilters"

export function CaptionList({
  label,
  page,
  hex,
  edits,
  locked,
  filters: showFilters = true,
  initialFilter = "all",
  query = "",
}: {
  label: string
  page: PageDetail
  hex: string
  edits: CaptionEdits
  locked: boolean
  filters?: boolean
  initialFilter?: ItemFilter
  query?: string
}) {
  const filters = useCaptionFilters({ page, edits, initialFilter, query, controlled: showFilters })
  const [lightbox, setLightbox] = useState<number | null>(null)
  const open = useCallback(
    (imageId: string) => setLightbox(Math.max(0, filters.shown.items.findIndex((entry) => entry.imageId === imageId))),
    [filters.shown.items],
  )

  return (
    <div className="flex flex-col gap-3">
      {showFilters && <CaptionFilterBar filters={filters} hex={hex} />}
      <SaveError error={edits.saveError} />
      {filters.shown.items.length === 0 ? (
        <CaptionFilterEmpty filters={filters} />
      ) : (
        <CaptionCards label={label} hex={hex} edits={edits} filters={filters} locked={locked} grouped={!showFilters} onOpen={open} />
      )}
      {lightbox !== null && (
        <CaptionLightbox
          label={label}
          page={page}
          items={filters.shown.items}
          index={lightbox}
          edits={edits}
          locked={locked}
          hex={hex}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
        />
      )}
    </div>
  )
}
