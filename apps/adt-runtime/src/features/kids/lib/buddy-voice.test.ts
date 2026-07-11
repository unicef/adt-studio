// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearKidsVoiceCache,
  loadKidsVoiceManifest,
  playBuddyLine,
} from "@/features/kids/lib/buddy-voice"

const MANIFEST = {
  version: 1,
  characters: {
    dino: { "kids-buddy-greet": "dino/kids-buddy-greet.mp3" },
  },
}

class AudioMock {
  static instances: AudioMock[] = []
  src: string
  paused = false
  constructor(src: string) {
    this.src = src
    AudioMock.instances.push(this)
  }
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
}

beforeEach(() => {
  clearKidsVoiceCache()
  AudioMock.instances = []
  vi.stubGlobal("Audio", AudioMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("buddy-voice", () => {
  it("plays a clip listed in the manifest and reports success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) }),
      ),
    )
    const played = await playBuddyLine("en", "dino", "kids-buddy-greet")
    expect(played).toBe(true)
    expect(AudioMock.instances[0]?.src).toBe(
      "./content/kids-voice/en/dino/kids-buddy-greet.mp3",
    )
    expect(AudioMock.instances[0]?.play).toHaveBeenCalled()
  })

  it("stays silent for unknown characters or lines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) }),
      ),
    )
    expect(await playBuddyLine("en", "robot", "kids-buddy-greet")).toBe(false)
    expect(await playBuddyLine("en", "dino", "kids-unknown")).toBe(false)
    expect(AudioMock.instances).toHaveLength(0)
  })

  it("degrades silently when the book ships no voice pack", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 })),
    )
    expect(await playBuddyLine("en", "dino", "kids-buddy-greet")).toBe(false)
  })

  it("degrades silently when fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )
    expect(await playBuddyLine("en", "dino", "kids-buddy-greet")).toBe(false)
  })

  it("fetches the manifest once per language", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) }),
    )
    vi.stubGlobal("fetch", fetchMock)
    await loadKidsVoiceManifest("en")
    await playBuddyLine("en", "dino", "kids-buddy-greet")
    await playBuddyLine("en", "dino", "kids-buddy-greet")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("stops the previous clip before starting the next", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) }),
      ),
    )
    await playBuddyLine("en", "dino", "kids-buddy-greet")
    await playBuddyLine("en", "dino", "kids-buddy-greet")
    expect(AudioMock.instances).toHaveLength(2)
    expect(AudioMock.instances[0]?.pause).toHaveBeenCalled()
  })
})
