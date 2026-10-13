// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import {
  autoplayModeAtom,
  isPlayingAtom,
  readAloudModeAtom,
} from "@/features/audio/state/audio.atoms"
import { audioFilesAtom } from "@/features/language/state/language.atoms"
import { pageEpochAtom } from "@/features/navigation/state/nav.atoms"
import { useAudioPlayer } from "./useAudioPlayer"

const store = getDefaultStore()
const played: string[] = []
// The hook drives a single audio element.
let audioPlaying = false

function showPage(id: string): void {
  document.getElementById("content")!.innerHTML = `<p data-id="${id}">Text</p>`
}

// Boot order: the hook mounts before the audio manifest has loaded.
async function mountPlayer() {
  const view = renderHook(() => useAudioPlayer())
  await act(async () => {
    store.set(audioFilesAtom, { pg002: "pg002.mp3", pg003: "pg003.mp3" })
  })
  return view
}

async function turnPage(id: string, epoch: number): Promise<void> {
  await act(async () => {
    showPage(id)
    store.set(pageEpochAtom, epoch)
  })
}

beforeEach(() => {
  played.length = 0
  audioPlaying = false
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(() => !audioPlaying)
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    audioPlaying = true
    played.push(this.src.split("/").pop() ?? "")
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {
    audioPlaying = false
  })
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})

  const content = document.createElement("div")
  content.id = "content"
  document.body.appendChild(content)
  showPage("pg002")
  store.set(readAloudModeAtom, true)
  store.set(autoplayModeAtom, true)
  store.set(isPlayingAtom, false)
  store.set(pageEpochAtom, 1)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.getElementById("content")?.remove()
  store.set(audioFilesAtom, {})
  store.set(readAloudModeAtom, false)
  store.set(autoplayModeAtom, true)
  store.set(isPlayingAtom, false)
  store.set(pageEpochAtom, 0)
  localStorage.clear()
})

describe("useAudioPlayer across an in-place page turn", () => {
  it("stays silent when autoplay was switched off after the first page loaded", async () => {
    const { result } = await mountPlayer()
    expect(played).toEqual(["pg002.mp3"])

    await act(async () => {
      store.set(autoplayModeAtom, false)
      result.current.pause()
    })
    await turnPage("pg003", 2)

    expect(played).toEqual(["pg002.mp3"])
    expect(store.get(isPlayingAtom)).toBe(false)
  })

  it("still starts the next page with autoplay on, as a document load would", async () => {
    const { result } = await mountPlayer()

    await act(async () => {
      result.current.pause()
    })
    await turnPage("pg003", 2)

    expect(played).toEqual(["pg002.mp3", "pg003.mp3"])
  })
})
