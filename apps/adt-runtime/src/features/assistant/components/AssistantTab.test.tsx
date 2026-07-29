// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it } from "vitest"
import {
  translationsAtom,
  videoFilesAtom,
} from "@/features/language/state/language.atoms"
import { currentPageNumberAtom } from "@/features/navigation/state/nav.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { AssistantTab } from "./AssistantTab"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function renderAssistant(videoFiles: Record<string, string>) {
  const store = createStore()
  store.set(appConfigAtom, {
    languages: { available: ["en"], default: "en" },
    features: { signLanguage: true },
  })
  store.set(translationsAtom, { "sign-language-label": "Sign language" })
  store.set(currentPageNumberAtom, 1)
  store.set(videoFilesAtom, videoFiles)

  return render(
    <Provider store={store}>
      <AssistantTab />
    </Provider>,
  )
}

describe("AssistantTab", () => {
  it("hides the sign-language toggle when the current page has no video", () => {
    renderAssistant({ "video-2": "page-two.mp4" })

    expect(screen.queryByText("Sign language")).toBeNull()
  })

  it("shows the sign-language toggle when the current page has a video", () => {
    renderAssistant({ "video-1": "page-one.mp4" })

    expect(screen.getByText("Sign language")).not.toBeNull()
  })
})
