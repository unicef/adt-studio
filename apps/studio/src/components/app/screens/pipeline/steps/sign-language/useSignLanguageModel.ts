import { useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { PageSummaryItem, SignLanguageVideo } from "@/api/client"
import { useSignLanguageVideos } from "@/hooks/use-sign-language-videos"
import { isGlossaryVideoSectionId } from "@/lib/glossary-video"
import { buildSectionEntries } from "@/components/pipeline/stages/sign-language/components/sectionEntries"
import type { SectionEntry } from "@/components/pipeline/stages/sign-language/components/types"

export const ALL_VIDEOS = ""
/* eslint-disable-next-line lingui/no-unlocalized-strings -- a filter key, never shown */
export const NOT_PLACED = "__unassigned"

export type VideoFilter = string

export interface SignLanguageModel {
  isLoading: boolean
  videos: SignLanguageVideo[]
  sections: SectionEntry[]
  sectionById: Map<string, SectionEntry>
  videoBySection: Map<string, SignLanguageVideo>
  covered: number
  total: number
  nextMissing: SectionEntry | null
  unplaced: SignLanguageVideo[]
  orphans: SignLanguageVideo[]
  pageOf: (video: SignLanguageVideo) => number | null
  isOrphan: (video: SignLanguageVideo) => boolean
  matches: (video: SignLanguageVideo, filter: VideoFilter) => boolean
}

export function useSignLanguageModel(label: string, pages: PageSummaryItem[] | undefined): SignLanguageModel {
  const { i18n } = useLingui()
  const query = useSignLanguageVideos(label)

  const videos = useMemo(
    () => (query.data?.videos ?? []).filter((video) => !isGlossaryVideoSectionId(video.sectionId)),
    [query.data],
  )
  const sections = useMemo(() => buildSectionEntries(pages, i18n), [pages, i18n])
  const sectionById = useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections])

  return useMemo(() => {
    const videoBySection = new Map<string, SignLanguageVideo>()
    for (const video of videos) if (video.sectionId && sectionById.has(video.sectionId)) videoBySection.set(video.sectionId, video)
    const pageOf = (video: SignLanguageVideo) => (video.sectionId ? (sectionById.get(video.sectionId)?.pageNumber ?? null) : null)
    const isOrphan = (video: SignLanguageVideo) => !!video.sectionId && !sectionById.has(video.sectionId)
    const matches = (video: SignLanguageVideo, filter: VideoFilter) => {
      if (filter === ALL_VIDEOS) return true
      const page = pageOf(video)
      if (filter === NOT_PLACED) return page === null
      return page !== null && String(page) === filter
    }
    return {
      isLoading: query.isLoading,
      videos,
      sections,
      sectionById,
      videoBySection,
      covered: sections.filter((section) => videoBySection.has(section.sectionId)).length,
      total: sections.length,
      nextMissing: sections.find((section) => !videoBySection.has(section.sectionId)) ?? null,
      unplaced: videos.filter((video) => pageOf(video) === null),
      orphans: videos.filter(isOrphan),
      pageOf,
      isOrphan,
      matches,
    }
  }, [query.isLoading, videos, sections, sectionById])
}
