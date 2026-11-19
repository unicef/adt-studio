import { describe, expect, it } from "vitest"
import { buildRuntimeTimecodeMap } from "../packaging/web.js"

describe("buildRuntimeTimecodeMap — element audio", () => {
  it("AC-5: does not publish element-audio word timings", () => {
    const timestamps = {
      entries: {
        "pg001_im001_audio": {
          textId: "pg001_im001_audio",
          language: "en",
          words: [{ word: "Mago", start: 0, end: 0.5 }],
        },
      },
    } as never

    expect(buildRuntimeTimecodeMap(timestamps)).toEqual({})
  })
})
