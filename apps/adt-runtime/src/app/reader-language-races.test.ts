// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { subscribeLanguageChanges } from "./lifecycle"
import { currentLanguageAtom, translationsAtom, audioFilesAtom, imageFilesAtom, speechTextsAtom } from "@/features/language/state/language.atoms"
import { glossaryDataAtom } from "@/features/glossary/state/glossary.atoms"
import { timecodeMapsAtom } from "@/features/audio/state/audio.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"

const store = getDefaultStore()
let unsubscribe: (() => void) | undefined
let release: () => void
let gate: Promise<void>
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve()
}

const glossary = (language: string) => ({
  term: { word: "term", definition: language, variations: [], emoji: "" },
})

function response(url: string, language: string) {
  let data: unknown = {}
  if (url.includes("/texts.json")) data = { sentence: language }
  else if (url.includes("/speech_texts.json")) data = { sentence: `${language} speech` }
  else if (url.includes("/audios.json")) data = { sentence: `${language}.mp3` }
  else if (url.includes("/images.json")) data = { illustration: `${language}.png` }
  else if (url.includes("/glossary.json")) data = glossary(language)
  else if (url.includes("/timecode_output.json")) data = { sentence: { timecodes: [null, { word_timestamps: [{ text: language, start: 0, end: 1 }] }] } }
  return { ok: !url.includes("voices.json"), status: url.includes("voices.json") ? 404 : 200, json: async () => data }
}
beforeEach(() => {
  document.body.innerHTML = '<main><p data-id="sentence">en</p></main>'
  document.documentElement.lang = "en"
  store.set(currentLanguageAtom, "en")
  store.set(translationsAtom, { sentence: "en" })
  store.set(audioFilesAtom, { sentence: "en.mp3" })
  store.set(glossaryDataAtom, glossary("en"))
  store.set(timecodeMapsAtom, {
    primary: { sentence: [{ text: "en", start: 0, end: 1 }] },
    secondary: {},
  })
  store.set(appConfigAtom, {
    bundleVersion: "race",
    languages: { available: ["en", "fr", "es"], default: "en" },
    features: {},
  })
  gate = new Promise<void>((resolve) => { release = resolve })
})
afterEach(async () => {
  unsubscribe?.()
  unsubscribe = undefined
  release()
  await settle()
  vi.unstubAllGlobals()
})

it.each(["success", "http-error", "network-error"])("keeps the latest selected language when the older request ends with %s", async (outcome) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const language = url.includes("/fr/") ? "fr" : "es"
    if (language === "fr") {
      await gate
      if (outcome === "network-error") throw new Error("Controlled old request failure")
      if (outcome === "http-error") return { ok: false, status: 503 }
    }
    return response(url, language)
  }))
  unsubscribe = subscribeLanguageChanges()
  store.set(currentLanguageAtom, "fr")
  store.set(currentLanguageAtom, "es")
  await vi.waitFor(() => expect(document.querySelector("p")?.textContent).toBe("es"))
  release()
  await settle()
  expect(store.get(currentLanguageAtom)).toBe("es")
  expect(document.documentElement.lang).toBe("es")
  expect(store.get(translationsAtom).sentence).toBe("es")
  expect(store.get(speechTextsAtom).sentence).toBe("es speech")
  expect(store.get(audioFilesAtom).sentence).toBe("es.mp3")
  expect(store.get(imageFilesAtom).illustration).toBe("es.png")
  expect(store.get(glossaryDataAtom)).toEqual(glossary("es"))
  expect(store.get(timecodeMapsAtom).primary.sentence?.[0].text).toBe("es")
  expect(document.querySelector("p")?.textContent).toBe("es")
})

it("does not publish a language load after its subscription is disposed", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { await gate; return response(url, "fr") }))
  unsubscribe = subscribeLanguageChanges()
  store.set(currentLanguageAtom, "fr")
  unsubscribe()
  unsubscribe = undefined
  store.set(translationsAtom, { sentence: "new reader" })
  document.querySelector("p")!.textContent = "new reader"
  release()
  await settle()
  expect(store.get(translationsAtom).sentence).toBe("new reader")
  expect(document.querySelector("p")?.textContent).toBe("new reader")
})

it("clears failed current language data and can load a later selection", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/fr/")) return { ok: false, status: 503 }
    return response(url, "es")
  }))
  unsubscribe = subscribeLanguageChanges()
  store.set(currentLanguageAtom, "fr")
  await vi.waitFor(() => expect(store.get(audioFilesAtom)).toEqual({}))
  expect(store.get(glossaryDataAtom)).toEqual({})
  expect(store.get(timecodeMapsAtom)).toEqual({ primary: {}, secondary: {} })
  store.set(currentLanguageAtom, "es")
  await vi.waitFor(() => expect(document.querySelector("p")?.textContent).toBe("es"))
  expect(store.get(audioFilesAtom).sentence).toBe("es.mp3")
})
