// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import {
  autoplayModeAtom,
  currentAudioIndexAtom,
  isPlayingAtom,
  readAloudModeAtom,
} from "@/features/audio/state/audio.atoms"
import { audioFilesAtom, audioLanguageAtom, audioVoicesAtom, narratorVoiceAtom, currentLanguageAtom } from "@/features/language/state/language.atoms"
import { pageEpochAtom } from "@/features/navigation/state/nav.atoms"
import { useAudioPlayer } from "./useAudioPlayer"

const store = getDefaultStore()
const played: string[] = []
const playedUrls: string[] = []
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
  playedUrls.length = 0
  audioPlaying = false
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(() => !audioPlaying)
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    audioPlaying = true
    played.push(this.src.split("/").pop() ?? "")
    playedUrls.push(this.src)
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
  store.set(currentLanguageAtom, "en")
  store.set(audioLanguageAtom, "en")
  store.set(audioVoicesAtom, null)
  store.set(narratorVoiceAtom, "primary")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.getElementById("content")?.remove()
  store.set(audioFilesAtom, {})
  store.set(audioLanguageAtom, null)
  store.set(audioVoicesAtom, null)
  store.set(narratorVoiceAtom, "primary")
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

// Exercise the real catalog subscription: selected language changes before
// its files/DOM are ready, rather than writing every atom in one test tick.
describe("useAudioPlayer while language catalogs load", () => {
  let unsubscribe: (() => void) | undefined
  let release: () => void

  beforeEach(() => {
    release = () => {}
  })
  afterEach(() => {
    unsubscribe?.()
    unsubscribe = undefined
    release()
    vi.unstubAllGlobals()
  })

  async function holdFrenchCatalogs(
    fail = false,
    audios: Record<string, string> = { pg002: "french-signature.mp3" },
  ) {
    const { subscribeLanguageChanges } = await import("@/app/lifecycle")
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      await gate
      const optional = url.includes("voices.json")
      return {
        ok: !fail && !optional,
        status: fail ? 503 : optional ? 404 : 200,
        json: async () => url.includes("/texts.json")
          ? { pg002: "Texte français", pg003: "Autre texte", pg004: "Troisième texte" }
          : url.includes("/audios.json") ? audios : {},
      }
    }))
    unsubscribe = subscribeLanguageChanges()
    await act(async () => { store.set(currentLanguageAtom, "fr") })
  }

  async function finishCatalogs() {
    await act(async () => {
      release()
      for (let i = 0; i < 40; i++) await Promise.resolve()
    })
  }

  it("waits for the requested manifest and DOM before resuming with its filename", async () => {
    await mountPlayer()
    const before = played.length
    await holdFrenchCatalogs()
    expect(played).toHaveLength(before)
    expect(store.get(isPlayingAtom)).toBe(false)
    await finishCatalogs()
    expect(played.at(-1)).toBe("french-signature.mp3")
    expect(playedUrls.at(-1)).toContain("/fr/audio/french-signature.mp3")
    expect(document.querySelector('[data-id="pg002"]')?.textContent).toBe("Texte français")
    expect(store.get(audioLanguageAtom)).toBe("fr")
    expect(store.get(isPlayingAtom)).toBe(true)
  })

  it.each(["pause", "stop"] as const)("honors %s while the new language is pending", async (action) => {
    const { result } = await mountPlayer()
    await holdFrenchCatalogs()
    await act(async () => { result.current[action]() })
    const before = played.length
    await finishCatalogs()
    expect(played).toHaveLength(before)
    expect(store.get(isPlayingAtom)).toBe(false)
    await act(async () => { result.current.play() })
    expect(played.at(-1)).toBe("french-signature.mp3")
  })

  it("waits when returning to the original language after only part of another catalog arrived", async () => {
    await mountPlayer()
    const { subscribeLanguageChanges } = await import("@/app/lifecycle")
    let releaseFrench!: () => void
    let releaseEnglish!: () => void
    const frenchTimings = new Promise<void>((resolve) => { releaseFrench = resolve })
    const english = new Promise<void>((resolve) => { releaseEnglish = resolve })
    release = () => { releaseFrench(); releaseEnglish() }
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const lang = url.includes("/fr/") ? "fr" : "en"
      if (lang === "en") await english
      if (lang === "fr" && url.includes("timecode_output")) await frenchTimings
      return {
        ok: !url.includes("voices.json"),
        status: url.includes("voices.json") ? 404 : 200,
        json: async () => url.includes("/texts.json") ? { pg002: lang }
          : url.includes("/audios.json") ? { pg002: `${lang}-signature.mp3` } : {},
      }
    }))
    unsubscribe = subscribeLanguageChanges()
    await act(async () => {
      store.set(currentLanguageAtom, "fr")
      for (let i = 0; i < 40; i++) await Promise.resolve()
    })
    expect(store.get(audioFilesAtom)).toEqual({ pg002: "fr-signature.mp3" })
    expect(store.get(audioLanguageAtom)).toBe(null)
    await act(async () => { store.set(currentLanguageAtom, "en") })
    await act(async () => { releaseFrench() })
    expect(played).toEqual(["pg002.mp3"])
    expect(store.get(audioLanguageAtom)).toBe(null)
    await finishCatalogs()
    expect(played).toEqual(["pg002.mp3", "en-signature.mp3"])
    expect(playedUrls.at(-1)).toContain("/en/audio/en-signature.mp3")
    expect(store.get(isPlayingAtom)).toBe(true)
  })

  async function mountThreeItems() {
    const view = await mountPlayer()
    await act(async () => {
      document.getElementById("content")!.innerHTML = '<p data-id="pg002">One</p><p data-id="pg003">Two</p><p data-id="pg004">Three</p>'
      store.set(audioFilesAtom, { pg002: "pg002.mp3", pg003: "pg003.mp3", pg004: "pg004.mp3" })
    })
    return view
  }

  it("keeps the pending Next target by data ID when earlier recordings are missing in the new language", async () => {
    const { result } = await mountThreeItems()
    await holdFrenchCatalogs(false, { pg003: "fr-two.mp3", pg004: "fr-three.mp3" })
    await act(async () => { result.current.playNext() })
    expect(store.get(currentAudioIndexAtom)).toBe(1)
    await finishCatalogs()
    expect(played.at(-1)).toBe("fr-two.mp3")
    expect(store.get(currentAudioIndexAtom)).toBe(0)
  })

  it("keeps pending controls on the last ready order while only audio files have arrived", async () => {
    const { result } = await mountThreeItems()
    const { subscribeLanguageChanges } = await import("@/app/lifecycle")
    const timings = new Promise<void>((resolve) => { release = resolve })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("timecode_output")) await timings
      return {
        ok: !url.includes("voices.json"),
        status: url.includes("voices.json") ? 404 : 200,
        json: async () => url.includes("/texts.json") ? { pg002: "Un", pg003: "Deux", pg004: "Trois" }
          : url.includes("/audios.json") ? { pg003: "fr-two.mp3", pg004: "fr-three.mp3" } : {},
      }
    }))
    unsubscribe = subscribeLanguageChanges()
    await act(async () => {
      store.set(currentLanguageAtom, "fr")
      for (let i = 0; i < 40; i++) await Promise.resolve()
    })
    expect(store.get(audioFilesAtom)).toEqual({ pg003: "fr-two.mp3", pg004: "fr-three.mp3" })
    expect(store.get(audioLanguageAtom)).toBe(null)
    await act(async () => { result.current.playNext() })
    await finishCatalogs()
    expect(played.at(-1)).toBe("fr-two.mp3")
  })

  it("keeps the queued target when the new language adds the selected narrator", async () => {
    store.set(narratorVoiceAtom, "secondary")
    const { result } = await mountThreeItems()
    const { subscribeLanguageChanges } = await import("@/app/lifecycle")
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      await gate
      return {
        ok: !url.includes("timecode_voices.json"),
        status: url.includes("timecode_voices.json") ? 404 : 200,
        json: async () => url.includes("/texts.json") ? { pg002: "Un", pg003: "Deux", pg004: "Trois" }
          : url.includes("/audio_voices.json") ? {
            defaultVoice: "primary",
            voices: {
              primary: { label: "First", audios: { pg002: "fr-one.mp3", pg003: "fr-two.mp3" } },
              secondary: { label: "Second", audios: { pg002: "fr-second-one.mp3", pg003: "fr-second-two.mp3" } },
            },
          } : url.includes("/audios.json") ? { pg002: "fr-one.mp3", pg003: "fr-two.mp3" } : {},
      }
    }))
    unsubscribe = subscribeLanguageChanges()
    await act(async () => { store.set(currentLanguageAtom, "fr") })
    await act(async () => { result.current.playNext() })
    await finishCatalogs()
    expect(played.at(-1)).toBe("fr-second-two.mp3")
    expect(store.get(isPlayingAtom)).toBe(true)
  })

  it("preserves pending position when the target language lacks the selected narrator", async () => {
    const { result } = await mountThreeItems()
    await act(async () => {
      store.set(audioVoicesAtom, {
        defaultVoice: "primary",
        voices: {
          primary: { label: "First", audios: { pg002: "pg002.mp3", pg003: "pg003.mp3", pg004: "pg004.mp3" } },
          secondary: { label: "Second", audios: { pg002: "second-one.mp3", pg003: "second-two.mp3", pg004: "second-three.mp3" } },
        },
      })
      store.set(narratorVoiceAtom, "secondary")
    })
    await act(async () => { result.current.playAtIndex(1) })
    const { subscribeLanguageChanges } = await import("@/app/lifecycle")
    const timings = new Promise<void>((resolve) => { release = resolve })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("timecode_output")) await timings
      return {
        ok: !url.includes("voices.json"),
        status: url.includes("voices.json") ? 404 : 200,
        json: async () => url.includes("/texts.json") ? { pg002: "Un", pg003: "Deux", pg004: "Trois" }
          : url.includes("/audios.json") ? { pg002: "fr-one.mp3", pg003: "fr-two.mp3", pg004: "fr-three.mp3" } : {},
      }
    }))
    unsubscribe = subscribeLanguageChanges()
    await act(async () => {
      store.set(currentLanguageAtom, "fr")
      for (let i = 0; i < 40; i++) await Promise.resolve()
    })
    expect(store.get(currentAudioIndexAtom)).toBe(1)
    await act(async () => { result.current.playNext() })
    await finishCatalogs()
    expect(played.at(-1)).toBe("fr-three.mp3")
  })

  it("retains the queued target when returning to the original language restores its narrator", async () => {
    const { result } = await mountThreeItems()
    const primary = { pg002: "pg002.mp3", pg003: "pg003.mp3", pg004: "pg004.mp3" }
    const voices = {
      defaultVoice: "primary" as const,
      voices: {
        primary: { label: "First", audios: primary },
        secondary: { label: "Second", audios: { pg002: "second-one.mp3", pg003: "second-two.mp3", pg004: "second-three.mp3" } },
      },
    }
    await act(async () => {
      store.set(audioVoicesAtom, voices)
      store.set(narratorVoiceAtom, "secondary")
    })
    await act(async () => { result.current.playAtIndex(1) })
    const { subscribeLanguageChanges } = await import("@/app/lifecycle")
    let releaseFrench!: () => void
    let releaseEnglish!: () => void
    const frenchTimings = new Promise<void>((resolve) => { releaseFrench = resolve })
    const english = new Promise<void>((resolve) => { releaseEnglish = resolve })
    release = () => { releaseFrench(); releaseEnglish() }
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const lang = url.includes("/fr/") ? "fr" : "en"
      if (lang === "en") await english
      if (lang === "fr" && url.includes("timecode_output")) await frenchTimings
      const voiceManifest = url.includes("/audio_voices.json")
      const available = voiceManifest ? lang === "en" : !url.includes("voices.json")
      return {
        ok: available,
        status: available ? 200 : 404,
        json: async () => voiceManifest ? voices
          : url.includes("/texts.json") ? { pg002: `${lang} one`, pg003: `${lang} two`, pg004: `${lang} three` }
          : url.includes("/audios.json") ? primary : {},
      }
    }))
    unsubscribe = subscribeLanguageChanges()
    await act(async () => {
      store.set(currentLanguageAtom, "fr")
      for (let i = 0; i < 40; i++) await Promise.resolve()
    })
    await act(async () => { store.set(currentLanguageAtom, "en") })
    await act(async () => { result.current.playNext() })
    await finishCatalogs()
    expect(playedUrls.at(-1)).toContain("/en/audio/second-three.mp3")
  })

  it("still pauses and resets position for an explicit narrator change after loading", async () => {
    const { result } = await mountThreeItems()
    await act(async () => {
      store.set(audioVoicesAtom, {
        defaultVoice: "primary",
        voices: {
          primary: { label: "First", audios: { pg002: "pg002.mp3", pg003: "pg003.mp3" } },
          secondary: { label: "Second", audios: { pg002: "second-one.mp3", pg003: "second-two.mp3" } },
        },
      })
    })
    await act(async () => { result.current.playAtIndex(1) })
    await act(async () => { store.set(narratorVoiceAtom, "secondary") })
    expect(store.get(currentAudioIndexAtom)).toBe(0)
    expect(store.get(isPlayingAtom)).toBe(false)
    await act(async () => { result.current.play() })
    expect(played.at(-1)).toBe("second-one.mp3")
  })

  it("does not substitute another recording when the pending target has no audio", async () => {
    const { result } = await mountThreeItems()
    await holdFrenchCatalogs(false, { pg002: "fr-one.mp3", pg004: "fr-three.mp3" })
    await act(async () => { result.current.playNext() })
    const before = played.length
    await finishCatalogs()
    expect(played).toHaveLength(before)
    expect(store.get(isPlayingAtom)).toBe(false)
  })

  it("honors repeated Next and Previous while a language is pending", async () => {
    const { result } = await mountThreeItems()
    await holdFrenchCatalogs(false, { pg002: "fr-one.mp3", pg003: "fr-two.mp3", pg004: "fr-three.mp3" })
    await act(async () => { result.current.playNext() })
    await act(async () => { result.current.playNext() })
    await act(async () => { result.current.playPrevious() })
    await finishCatalogs()
    expect(played.at(-1)).toBe("fr-two.mp3")
  })

  it.each(["pause", "stop"] as const)("cancels pending Next playback on %s", async (action) => {
    const { result } = await mountThreeItems()
    await holdFrenchCatalogs(false, { pg002: "fr-one.mp3", pg003: "fr-two.mp3", pg004: "fr-three.mp3" })
    await act(async () => { result.current.playNext() })
    await act(async () => { result.current[action]() })
    const before = played.length
    await finishCatalogs()
    expect(played).toHaveLength(before)
    expect(store.get(isPlayingAtom)).toBe(false)
    await act(async () => { result.current.play() })
    expect(played.at(-1)).toBe(action === "pause" ? "fr-two.mp3" : "fr-one.mp3")
  })

  it("does not resume an old clip when the requested audio manifest fails", async () => {
    await mountPlayer()
    const before = played.length
    await holdFrenchCatalogs(true)
    await finishCatalogs()
    expect(played).toHaveLength(before)
    expect(store.get(isPlayingAtom)).toBe(false)
    expect(store.get(audioFilesAtom)).toEqual({})
  })
})

describe("useAudioPlayer promise ownership", () => {
  it.each(["resolve", "reject"] as const)("ignores a resumed play's late %s after the next page starts", async (outcome) => {
    const { result } = await mountPlayer()
    // Put the media boundary on the resume path, rather than a fresh src.
    const audio = vi.mocked(HTMLMediaElement.prototype.play).mock.contexts[0]!
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 0.5 })
    Object.defineProperty(audio, "duration", { configurable: true, value: 10 })
    let resolve!: () => void
    let reject!: (error: Error) => void
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((yes, no) => {
      resolve = yes
      reject = no
    }))
    await act(async () => { result.current.play() })
    await turnPage("pg003", 2)
    expect(store.get(isPlayingAtom)).toBe(true)
    await act(async () => {
      if (outcome === "resolve") resolve()
      else reject(new Error("Previous play was interrupted"))
    })
    expect(store.get(isPlayingAtom)).toBe(true)
    expect(played.at(-1)).toBe("pg003.mp3")
  })

  it.each(["stop", "unmount"] as const)("ignores an initial play completion after %s", async (action) => {
    store.set(autoplayModeAtom, false)
    const view = await mountPlayer()
    let finish!: () => void
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(async () => { view.result.current.play() })
    await act(async () => {
      if (action === "stop") view.result.current.stop()
      else view.unmount()
    })
    await act(async () => { finish() })
    expect(store.get(isPlayingAtom)).toBe(false)
  })
})
