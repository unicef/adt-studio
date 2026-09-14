import { atom } from "jotai"
import { videoFilesAtom } from "@/features/language/state/language.atoms"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
} from "@/features/navigation/state/nav.atoms"

/**
 * Video filename assigned to the current runtime page, if one exists.
 *
 * `videos.json` is keyed by sectionId — the same id the video was assigned to
 * and named after. Bundles built before that keyed it by 1-based reading
 * position instead, so the legacy lookup is kept as a fallback; a bundle ships
 * its own runtime, so this only matters for a cached page meeting a freshly
 * rebuilt preview.
 */
export const currentPageSignLanguageVideoAtom = atom((get) => {
  const videoFiles = get(videoFilesAtom)
  const sectionId = get(currentSectionIdAtom)

  if (sectionId && videoFiles[sectionId]) return videoFiles[sectionId]

  const pages = get(pagesAtom)
  const pageIndex =
    get(currentPageNumberAtom) ??
    (sectionId ? pages.findIndex((page) => page.section_id === sectionId) + 1 : 0)

  if (pageIndex < 1) return null
  return videoFiles[`video-${pageIndex}`] ?? null
})
