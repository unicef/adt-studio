import { describe, expect, it } from "vitest"
import { isElementAudioCatalogEntry } from "./catalog-entries"

describe("isElementAudioCatalogEntry", () => {
  it("keeps authored element audio out of the Languages and Core TTS lists", () => {
    const authored = new Set(["pg001_im001_audio"])
    expect(isElementAudioCatalogEntry("pg001_im001_audio", authored)).toBe(true)
    expect(isElementAudioCatalogEntry("pg001_im001_audio_easy_read", authored)).toBe(true)
    expect(isElementAudioCatalogEntry("pg001_im001", authored)).toBe(false)
    expect(isElementAudioCatalogEntry("pg001_im001_easy_read", authored)).toBe(false)
    // A real text id that merely ends in _audio is not synthetic (v1 scope).
    expect(isElementAudioCatalogEntry("pg001_listen_audio", authored)).toBe(false)
  })

  it("AC-14: a legacy image id ending in _audio stays visible without the artifact entry", () => {
    expect(isElementAudioCatalogEntry("pg003_im007_audio", new Set())).toBe(false)
    expect(isElementAudioCatalogEntry("pg003_im007_audio", new Set(["pg003_im007_audio"]))).toBe(true)
  })
})
