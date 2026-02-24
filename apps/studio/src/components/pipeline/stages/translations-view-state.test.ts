import { describe, expect, it } from "vitest"
import { resolveTranslationLanguageState } from "./translations-view-state"

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
