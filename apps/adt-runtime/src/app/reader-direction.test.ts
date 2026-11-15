// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { applyDocumentLanguage, subscribeLanguageChanges } from "./lifecycle"
import { currentLanguageAtom, textDirectionAtom } from "@/features/language/state/language.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"

const store = getDefaultStore()
const root = document.documentElement

beforeEach(() => {
  root.lang = "en"
  root.removeAttribute("dir")
  store.set(currentLanguageAtom, "en")
})

describe("applyDocumentLanguage", () => {
  it("lays a right-to-left language out right to left", () => {
    applyDocumentLanguage("ur")
    expect(root.lang).toBe("ur")
    expect(root.getAttribute("dir")).toBe("rtl")
  })

  // Every page of an Urdu book ships as `<html lang="ur" dir="rtl">`; a reader
  // who picked the English translation must not keep that direction.
  it("drops the page's shipped direction for a left-to-right language", () => {
    root.lang = "ur"
    root.dir = "rtl"
    applyDocumentLanguage("en")
    expect(root.lang).toBe("en")
    expect(root.hasAttribute("dir")).toBe(false)
  })
})

describe("switching the reading language", () => {
  let unsubscribe: (() => void) | undefined

  beforeEach(() => {
    store.set(appConfigAtom, {
      bundleVersion: "dir",
      languages: { available: ["en", "ur"], default: "en" },
      features: {},
    })
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
    unsubscribe = subscribeLanguageChanges()
  })

  afterEach(() => {
    unsubscribe?.()
    vi.unstubAllGlobals()
  })

  it("flips the document and the chrome's direction with the language", () => {
    store.set(currentLanguageAtom, "ur")
    expect(root.getAttribute("dir")).toBe("rtl")
    expect(store.get(textDirectionAtom)).toBe("rtl")

    store.set(currentLanguageAtom, "en")
    expect(root.hasAttribute("dir")).toBe(false)
    expect(store.get(textDirectionAtom)).toBe("ltr")
  })
})
