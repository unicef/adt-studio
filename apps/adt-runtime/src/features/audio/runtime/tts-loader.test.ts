import { afterEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { timecodeMapsAtom } from "@/features/audio/state/audio.atoms"
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
})
