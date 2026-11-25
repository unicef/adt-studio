import { describe, expect, it } from "vitest"
import { buildRuntimeTimecodeMap } from "../packaging/web.js"

describe("buildRuntimeTimecodeMap — element audio", () => {
  const authored = new Set(["pg001_im001_audio"])
  const timestamps = {
    entries: {
      "pg001_im001_audio": {
        textId: "pg001_im001_audio",
        language: "en",
        words: [{ word: "Mago", start: 0, end: 0.5 }],
      },
    },
  } as never

  it("AC-5: does not publish authored element-audio word timings", () => {
    expect(buildRuntimeTimecodeMap(timestamps, undefined, undefined, "primary", authored)).toEqual({})
  })

  it("AC-14: a legacy image id ending in _audio keeps its word timings", () => {
    expect(
      Object.keys(buildRuntimeTimecodeMap(timestamps, undefined, undefined, "primary", new Set())),
    ).toEqual(["pg001_im001_audio"])
  })
})
