import { afterEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { glossaryDataAtom } from "@/features/glossary/state/glossary.atoms"
import { loadGlossary } from "./glossary-loader"

// #1157: an export with the glossary off writes no glossary.json.
describe("loadGlossary", () => {
  const store = getDefaultStore()
  const initialConfig = store.get(appConfigAtom)

  afterEach(() => {
    vi.unstubAllGlobals()
    store.set(appConfigAtom, initialConfig)
  })

  it("does not request glossary.json when the book's glossary is off", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    store.set(appConfigAtom, { ...initialConfig, features: { glossary: false } })

    expect(await loadGlossary("en")).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.get(glossaryDataAtom)).toEqual({})
  })

  it("still requests it when an older config doesn't say", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Hyena: { word: "Hyena" } })))
    vi.stubGlobal("fetch", fetchMock)
    store.set(appConfigAtom, { ...initialConfig, features: {} })

    await loadGlossary("en")
    expect(fetchMock).toHaveBeenCalledWith("./content/i18n/en/glossary.json")
  })
})
