import { afterEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { timecodeMapsAtom } from "@/features/audio/state/audio.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { loadTimecodes } from "./tts-loader"

describe("loadTimecodes", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("keeps primary timestamps when the optional voice manifest is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pg001_t001: {
              timecodes: [
                null,
                { word_timestamps: [{ text: "Hello", start: 0, end: 0.5 }] },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await loadTimecodes("en")

    expect(result.pg001_t001).toEqual([{ text: "Hello", start: 0, end: 0.5 }])
    expect(getDefaultStore().get(timecodeMapsAtom)).toEqual({
      primary: result,
      secondary: {},
    })
  })

  // #1157: a book with one narrator has no timecode_voices.json.
  it("does not request the voice timings when the export says there are no voice variants", async () => {
    const store = getDefaultStore()
    const initialConfig = store.get(appConfigAtom)
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    store.set(appConfigAtom, { ...initialConfig, features: { voiceVariants: false } })
    try {
      await loadTimecodes("en")
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith("./content/i18n/en/timecode/timecode_output.json")
    } finally {
      store.set(appConfigAtom, initialConfig)
    }
  })
})
