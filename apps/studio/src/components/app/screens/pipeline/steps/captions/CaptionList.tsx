import { useCallback, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { PageDetail } from "@/api/client"
import { Lightbox } from "@/components/pipeline/stages/captions/components/Lightbox"
import type { CaptionEntry, LightboxEntry } from "@/components/pipeline/stages/captions/lib/types"
import { StepFilterTabs } from "../shared/StepFilterTabs"
import { stableSelect } from "../shared/list/stableSelect"
import { matchesQuery } from "../shared/list/useListSearch"
import { SaveError, StepEmptyHint } from "../shared/ui"
import { CaptionItem } from "./CaptionItem"
import { ALL_SECTIONS, buildImageSectionMap, sectionTabs } from "./sectionGroups"
import type { CaptionEdits } from "./useCaptionEdits"

export type ItemFilter = "all" | "describe" | "decorative"

const imageKey = (entry: CaptionEntry) => entry.imageId
const needsDescription = (entry: CaptionEntry) => entry.decorative !== true && entry.caption.trim() === ""

export function CaptionList({
  label,
  page,
  hex,
  edits,
  locked,
  filters = true,
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
  const { t } = useLingui()
  const [ownFilter, setFilter] = useState<ItemFilter>(initialFilter)
  const [ownQuery, setOwnQuery] = useState(query)
  const filter = filters ? ownFilter : initialFilter
  const search = filters ? ownQuery : query
  const [section, setSection] = useState(ALL_SECTIONS)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const server = page.imageCaptioning?.captions ?? []
  const sourceOf = useMemo(() => new Map(server.map((entry) => [entry.imageId, entry.source])), [server])
  const sectionOf = useMemo(() => buildImageSectionMap(page), [page])
  const tabs = useMemo(
    () => sectionTabs(server.map(imageKey), sectionOf, page.sectioningTree?.sections.length ?? 0),
    [server, sectionOf, page.sectioningTree],
  )

  const editedKeys = edits.editedKeys
  const counts = useMemo(() => {
    let describe = 0
    let decorative = 0
    for (const entry of edits.items) {
      if (entry.decorative === true) decorative += 1
      else if (needsDescription(entry)) describe += 1
    }
    return { all: edits.items.length, describe, decorative }
  }, [edits.items])

  const select = useCallback(
    (list: readonly CaptionEntry[]) =>
      list.filter((entry) => {
        if (section !== ALL_SECTIONS && String(sectionOf.get(entry.imageId) ?? -1) !== section) return false
        if (editedKeys.has(entry.imageId)) return true
        if (!matchesQuery([entry.caption, entry.imageId], search)) return false
        if (filter === "describe") return needsDescription(entry)
        if (filter === "decorative") return entry.decorative === true
        return true
      }),
    [filter, section, sectionOf, search, editedKeys],
  )
  const shown = useMemo(() => stableSelect(edits.items, server, imageKey, select), [edits.items, server, select])

  const open = useCallback(
    (imageId: string) => setLightbox(Math.max(0, shown.items.findIndex((entry) => entry.imageId === imageId))),
    [shown.items],
  )
  const lightboxEntries: LightboxEntry[] = useMemo(
    () => shown.items.map((cap) => ({ cap, pageId: page.pageId, pageNumber: page.pageNumber })),
    [shown.items, page.pageId, page.pageNumber],
  )

  return (
    <div className="flex flex-col gap-3">
      {filters && (edits.items.length > 1 || tabs.length > 0 || ownFilter !== "all" || ownQuery.trim() !== "") && (
        <div className="flex flex-wrap items-center gap-2">
          <StepFilterTabs
            ariaLabel={t`Show images`}
            accent={hex}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t`All`, count: counts.all },
              { value: "describe", label: t`To describe`, count: counts.describe },
              { value: "decorative", label: t`Decorative`, count: counts.decorative },
            ]}
          />
          {tabs.length > 0 && (
            <StepFilterTabs
              ariaLabel={t`Show section`}
              accent={hex}
              value={section}
              onChange={setSection}
              options={[
                { value: ALL_SECTIONS, label: t`All sections`, count: counts.all },
                ...tabs.map((tab) => ({
                  value: tab.value,
                  label: tab.sectionIndex >= 0 ? t`Section ${tab.sectionIndex + 1}` : t`Other images`,
                  count: tab.count,
                })),
              ]}
            />
          )}
          {ownQuery.trim() !== "" && (
            <span className="flex h-8 items-center gap-1.5 rounded-lg border bg-card pl-2.5 pr-1 text-[12px] text-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
              <Search aria-hidden className="size-3 text-muted-foreground" />
              {t`Matching “${ownQuery.trim()}”`}
              <button
                type="button"
                onClick={() => setOwnQuery("")}
                aria-label={t`Show every image on this page`}
                className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>
      )}

      <SaveError error={edits.saveError} />

      {shown.items.length === 0 ? (
        <StepEmptyHint>
          {search.trim() ? t`No images on this page match “${search.trim()}”.` : filter === "describe" ? t`Every image here has a description.` : t`No images match this filter.`}
        </StepEmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.items.map((entry) => (
            <CaptionItem
              key={entry.imageId}
              label={label}
              entry={entry}
              source={sourceOf.get(entry.imageId)}
              hex={hex}
              edited={edits.editedKeys.has(entry.imageId)}
              locked={locked}
              stale={shown.stale.has(entry.imageId)}
              onCaption={edits.setCaption}
              onDecorative={edits.setDecorative}
              onOpen={open}
            />
          ))}
        </div>
      )}

      {lightbox !== null && lightboxEntries.length > 0 && (
        <Lightbox
          bookLabel={label}
          entries={lightboxEntries}
          index={Math.min(lightbox, lightboxEntries.length - 1)}
          dirty={edits.dirty}
          saving={edits.saving}
          readOnly={locked}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
          onCaptionChange={(entry, caption) => edits.setCaption(entry.cap.imageId, caption)}
          onToggleDecorative={(entry) => edits.setDecorative(entry.cap.imageId, entry.cap.decorative !== true)}
          onSave={() => void edits.save().catch(() => undefined)}
          onDiscard={edits.discard}
        />
      )}
    </div>
  )
}
