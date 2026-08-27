// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { audioFilesAtom } from "@/features/language/state/language.atoms"
import {
  isPlayingAtom,
  readAloudModeAtom,
} from "@/features/audio/state/audio.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { useAudioPlayer } from "./useAudioPlayer"

/**
 * Every page turn is a full document load, so "keep reading" can only be
 * inferred from persisted state. These cover the two halves of the rule that
 * are easy to break in opposite directions: a child who never asked must get
 * silence, and a child who did must not have to ask again on every page.
 */

const played: string[] = []

beforeEach(() => {
  played.length = 0
  // The player reads its playlist from the rendered book content.
  document.body.innerHTML =
    '<div id="content"><p data-id="a1">one</p><p data-id="a2">two</p></div>'

  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(
    function (this: HTMLMediaElement) {
      played.push(this.src || "clip")
      return Promise.resolve()
    },
  )
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(
    () => {},
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Harness() {
  useAudioPlayer()
  return null
}

function kidsStore({ wasPlaying }: { wasPlaying: boolean }) {
  const store = createStore()
  store.set(appConfigAtom, {
    languages: { available: ["en"], default: "en" },
    features: { kidsMode: true, readAloud: true },
  })
  store.set(readAloudModeAtom, true)
  // What the previous page left behind as it unloaded.
  store.set(isPlayingAtom, wasPlaying)
  store.set(audioFilesAtom, { a1: "one.mp3", a2: "two.mp3" })
  return store
}

describe("kids narration across page turns", () => {
  it("stays silent when the child never asked for read-aloud", async () => {
    const store = kidsStore({ wasPlaying: false })
    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(played).toHaveLength(0)
  })

  it("keeps reading when narration was playing as the last page unloaded", async () => {
    const store = kidsStore({ wasPlaying: true })
    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )
    await waitFor(() => expect(played.length).toBeGreaterThan(0))
  })
})
