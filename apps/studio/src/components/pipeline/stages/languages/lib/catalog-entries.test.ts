import { describe, expect, it } from "vitest"
import { isElementAudioCatalogEntry } from "./catalog-entries"

describe("isElementAudioCatalogEntry", () => {
  it("keeps authored element audio out of the Languages and Core TTS lists", () => {
    expect(isElementAudioCatalogEntry("pg001_im001_audio")).toBe(true)
    expect(isElementAudioCatalogEntry("pg001_im001_audio_easy_read")).toBe(true)
    expect(isElementAudioCatalogEntry("pg001_im001")).toBe(false)
    expect(isElementAudioCatalogEntry("pg001_im001_easy_read")).toBe(false)
    // A real text id that merely ends in _audio is not synthetic (v1 scope).
    expect(isElementAudioCatalogEntry("pg001_listen_audio")).toBe(false)
  })
})
