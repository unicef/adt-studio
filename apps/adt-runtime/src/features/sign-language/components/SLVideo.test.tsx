// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { currentLanguageAtom, videoFilesAtom } from "@/features/language/state/language.atoms"
import { currentPageNumberAtom, pagesAtom } from "@/features/navigation/state/nav.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { signLanguageModeAtom } from "@/shared/state/ui.atoms"
import { SLVideo } from "./SLVideo"

vi.mock("@atlaskit/pragmatic-drag-and-drop/element/adapter", () => ({
  draggable: () => () => {},
}))

vi.mock("@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview", () => ({
  disableNativeDragPreview: () => {},
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("SLVideo", () => {
  it("plays the assigned sign-language video once instead of looping", () => {
    const store = createStore()
    store.set(appConfigAtom, {
      languages: { available: ["en"], default: "en" },
      features: { signLanguage: true },
    })
    store.set(signLanguageModeAtom, true)
    store.set(currentLanguageAtom, "en")
    store.set(currentPageNumberAtom, 1)
    store.set(pagesAtom, [{ section_id: "section-1", href: "page-1.html" }])
    store.set(videoFilesAtom, { "video-1": "section-1.mp4" })

    const { container } = render(
      <Provider store={store}>
        <SLVideo />
      </Provider>,
    )

    const video = container.querySelector("video")
    expect(video).toBeInstanceOf(HTMLVideoElement)
    expect(video!.loop).toBe(false)
    expect(video!.hasAttribute("loop")).toBe(false)
  })
})
