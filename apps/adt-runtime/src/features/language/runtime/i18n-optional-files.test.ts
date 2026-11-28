import { afterEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { loadTranslations } from "./i18n"

// #1157: a book with one narrator has no audio_voices.json.
describe("loadTranslations optional files", () => {
  const store = getDefaultStore()
  const initialConfig = store.get(appConfigAtom)

  afterEach(() => {
    vi.unstubAllGlobals()
    store.set(appConfigAtom, initialConfig)
  })

  const requested = async (features: Record<string, boolean>) => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}"))
    vi.stubGlobal("fetch", fetchMock)
    store.set(appConfigAtom, { ...initialConfig, features })
    await loadTranslations("en")
    return fetchMock.mock.calls.map(([url]) => String(url))
  }

  it("does not request audio_voices.json when the export says there are no voice variants", async () => {
    expect((await requested({ voiceVariants: false })).some((url) => url.includes("audio_voices.json"))).toBe(false)
  })

  it("still requests it when an older config doesn't say", async () => {
    expect((await requested({})).some((url) => url.includes("audio_voices.json"))).toBe(true)
  })
})
