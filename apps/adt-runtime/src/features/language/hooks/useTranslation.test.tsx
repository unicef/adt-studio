// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { useTranslation } from "./useTranslation"

describe("useTranslation", () => {
  afterEach(() => {
    getDefaultStore().set(translationsAtom, {})
  })

  const translate = (dict: Record<string, string>) => {
    getDefaultStore().set(translationsAtom, dict)
    return renderHook(() => useTranslation()).result.current.t
  }

  it("returns the catalogue entry for a known key", () => {
    expect(translate({ "tts-label": "Texto a voz" })("tts-label")).toBe("Texto a voz")
  })

  it("interpolates variables", () => {
    expect(
      translate({ greeting: "Hola ${name}" })("greeting", { name: "Ana" }),
    ).toBe("Hola Ana")
  })

  // Without a fallback the raw key is a useful development signal, but it must
  // never be what a reader sees — hence the third argument.
  it("echoes the key when it is missing and no fallback is given", () => {
    expect(translate({})("narrator-voice-label")).toBe("narrator-voice-label")
  })

  it("uses the fallback when the key is missing", () => {
    expect(translate({})("narrator-voice-label", {}, "Narrator voice")).toBe(
      "Narrator voice",
    )
  })

  it("prefers the catalogue entry over the fallback", () => {
    expect(
      translate({ "narrator-voice-label": "Voz del narrador" })(
        "narrator-voice-label",
        {},
        "Narrator voice",
      ),
    ).toBe("Voz del narrador")
  })
})
