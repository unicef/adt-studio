import { describe, expect, it } from "vitest"
import {
  reconcileSourceOutputLanguage,
  resolveTranslationLanguageState,
} from "./translations-view-state"

describe("reconcileSourceOutputLanguage", () => {
  it("seeds the source language when the list is empty", () => {
    expect(reconcileSourceOutputLanguage([], "es")).toEqual(["es"])
  })

  it("updates a stale bare-base seed to the localized source", () => {
    // Source refined es -> es-UY; the previously-seeded "es" becomes "es-UY".
    expect(reconcileSourceOutputLanguage(["es"], "es-UY")).toEqual(["es-UY"])
  })

  it("keeps foreign output languages while updating the source entry", () => {
    expect(reconcileSourceOutputLanguage(["es", "fr"], "es-UY")).toEqual([
      "es-UY",
      "fr",
    ])
  })

  it("preserves a distinct regional variant sharing the source base", () => {
    // Source "es-UY" + user-added "es-MX" must both survive.
    expect(reconcileSourceOutputLanguage(["es-MX", "fr"], "es-UY")).toEqual([
      "es-UY",
      "es-MX",
      "fr",
    ])
  })

  it("does not drop a regional variant when the source is bare", () => {
    // Regression: source "en" + user-added "en-GB" — en-GB must NOT be removed.
    expect(reconcileSourceOutputLanguage(["en-GB"], "en")).toEqual([
      "en",
      "en-GB",
    ])
  })

  it("dedupes an exact duplicate of the source and normalizes casing", () => {
    expect(reconcileSourceOutputLanguage(["es_uy", "FR"], "es-UY")).toEqual([
      "es-UY",
      "fr",
    ])
  })
})

describe("resolveTranslationLanguageState", () => {
  it("prefers configured editing language over detected book language", () => {
    const result = resolveTranslationLanguageState({
      selectedLang: "fr-CA",
      configuredEditingLanguage: "fr",
      bookLanguage: "en",
      isBookLoading: true,
    })

    expect(result.editingLanguage).toBe("fr")
    expect(result.editingLangCode).toBe("fr")
    expect(result.isSourceLanguagePending).toBe(false)
    expect(result.isSourceLang).toBe(true)
  })

  it("falls back to detected book language when editing language is not configured", () => {
    const result = resolveTranslationLanguageState({
      selectedLang: "en-US",
      configuredEditingLanguage: undefined,
      bookLanguage: "en",
      isBookLoading: false,
    })

    expect(result.editingLanguage).toBe("en")
    expect(result.editingLangCode).toBe("en")
    expect(result.isSourceLanguagePending).toBe(false)
    expect(result.isSourceLang).toBe(true)
  })

  it("marks source language as pending while book metadata is still loading", () => {
    const result = resolveTranslationLanguageState({
      selectedLang: "fr",
      configuredEditingLanguage: undefined,
      bookLanguage: null,
      isBookLoading: true,
    })

    expect(result.editingLanguage).toBe("en")
    expect(result.editingLangCode).toBe(null)
    expect(result.isSourceLanguagePending).toBe(true)
    expect(result.isSourceLang).toBe(false)
  })

  it("does not stay pending after book loading finishes with no detected language", () => {
    const result = resolveTranslationLanguageState({
      selectedLang: "fr",
      configuredEditingLanguage: undefined,
      bookLanguage: null,
      isBookLoading: false,
    })

    expect(result.editingLanguage).toBe("en")
    expect(result.editingLangCode).toBe(null)
    expect(result.isSourceLanguagePending).toBe(false)
    expect(result.isSourceLang).toBe(false)
  })
})
