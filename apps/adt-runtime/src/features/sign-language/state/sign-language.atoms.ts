import { atom } from "jotai"
import { videoFilesAtom } from "@/features/language/state/language.atoms"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
} from "@/features/navigation/state/nav.atoms"

/** Video filename assigned to the current runtime page, if one exists. */
export const currentPageSignLanguageVideoAtom = atom((get) => {
  const pageNumber = get(currentPageNumberAtom)
  const sectionId = get(currentSectionIdAtom)
  const pages = get(pagesAtom)
  const pageIndex =
    pageNumber ??
    (sectionId ? pages.findIndex((page) => page.section_id === sectionId) + 1 : 0)

  if (pageIndex < 1) return null
  return get(videoFilesAtom)[`video-${pageIndex}`] ?? null
})
