import { createStore } from "jotai"
import { describe, expect, it } from "vitest"
import { videoFilesAtom } from "@/features/language/state/language.atoms"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
} from "@/features/navigation/state/nav.atoms"
import { currentPageSignLanguageVideoAtom } from "./sign-language.atoms"

describe("currentPageSignLanguageVideoAtom", () => {
  it("returns only the video assigned to the current page", () => {
    const store = createStore()
    store.set(currentPageNumberAtom, 2)
    store.set(videoFilesAtom, {
      "video-1": "page-one.mp4",
      "video-2": "page-two.mp4",
    })

    expect(store.get(currentPageSignLanguageVideoAtom)).toBe("page-two.mp4")

    store.set(currentPageNumberAtom, 3)
    expect(store.get(currentPageSignLanguageVideoAtom)).toBeNull()
  })

  it("falls back to the section position when page metadata is unavailable", () => {
    const store = createStore()
    store.set(currentPageNumberAtom, null)
    store.set(currentSectionIdAtom, "pg002_sec001")
    store.set(pagesAtom, [
      { section_id: "pg001_sec001", href: "index.html" },
      { section_id: "pg002_sec001", href: "pg002_sec001.html" },
    ])
    store.set(videoFilesAtom, { "video-2": "page-two.webm" })

    expect(store.get(currentPageSignLanguageVideoAtom)).toBe("page-two.webm")
  })
})
