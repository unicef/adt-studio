import { useCallback, useMemo, useState } from "react"
import type { PageDetail } from "@/api/client"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { stableSelect } from "../shared/list/stableSelect"
import { matchesQuery } from "../shared/list/useListSearch"
import { ALL_SECTIONS, buildImageSectionMap, sectionTabs } from "./sectionGroups"
import type { CaptionEdits } from "./useCaptionEdits"

export type ItemFilter = "all" | "describe" | "captioned" | "decorative"

export const imageKey = (entry: CaptionEntry) => entry.imageId
export const needsDescription = (entry: CaptionEntry) => entry.decorative !== true && entry.caption.trim() === ""
export const isDescribed = (entry: CaptionEntry) => entry.decorative !== true && entry.caption.trim() !== ""

export function matchesItemFilter(entry: CaptionEntry, filter: ItemFilter): boolean {
  if (filter === "describe") return needsDescription(entry)
  if (filter === "captioned") return isDescribed(entry)
  if (filter === "decorative") return entry.decorative === true
  return true
}

export function useCaptionFilters({
  page,
  edits,
  initialFilter = "all",
  query = "",
  controlled = true,
}: {
  page: PageDetail
  edits: CaptionEdits
  initialFilter?: ItemFilter
  query?: string
  controlled?: boolean
}) {
  const [ownFilter, setFilter] = useState<ItemFilter>(initialFilter)
  const [ownQuery, setSearch] = useState(query)
  const [section, setSection] = useState(ALL_SECTIONS)
  const filter = controlled ? ownFilter : initialFilter
  const search = controlled ? ownQuery : query

  const server = useMemo(() => page.imageCaptioning?.captions ?? [], [page.imageCaptioning])
  const sourceOf = useMemo(() => new Map(server.map((entry) => [entry.imageId, entry.source])), [server])
  const sectionOf = useMemo(() => buildImageSectionMap(page), [page])
  const sections = useMemo(() => page.sectioningTree?.sections ?? [], [page.sectioningTree])
  const tabs = useMemo(() => sectionTabs(server.map(imageKey), sectionOf, sections), [server, sectionOf, sections])

  const editedKeys = edits.editedKeys
  const counts = useMemo(() => {
    let describe = 0
    let captioned = 0
    let decorative = 0
    for (const entry of edits.items) {
      if (entry.decorative === true) decorative += 1
      else if (needsDescription(entry)) describe += 1
      else captioned += 1
    }
    return { all: edits.items.length, describe, captioned, decorative }
  }, [edits.items])

  const select = useCallback(
    (list: readonly CaptionEntry[]) =>
      list.filter((entry) => {
        if (section !== ALL_SECTIONS && String(sectionOf.get(entry.imageId) ?? -1) !== section) return false
        if (editedKeys.has(entry.imageId)) return true
        if (!matchesQuery([entry.caption, entry.imageId], search)) return false
        return matchesItemFilter(entry, filter)
      }),
    [filter, section, sectionOf, search, editedKeys],
  )
  const shown = useMemo(() => stableSelect(edits.items, server, imageKey, select), [edits.items, server, select])
  const filtering = filter !== "all" || section !== ALL_SECTIONS || search.trim() !== ""

  const clear = useCallback(() => {
    setFilter("all")
    setSection(ALL_SECTIONS)
    setSearch("")
  }, [])

  return {
    filter,
    setFilter,
    section,
    setSection,
    search,
    setSearch,
    ownQuery,
    counts,
    tabs,
    sections,
    sectionOf,
    sourceOf,
    shown,
    filtering,
    clear,
  }
}

export type CaptionFilters = ReturnType<typeof useCaptionFilters>
