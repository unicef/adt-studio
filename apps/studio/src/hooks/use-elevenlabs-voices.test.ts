import { describe, expect, it } from "vitest"
import { DEFAULT_ELEVENLABS_VOICE_ID, ELEVENLABS_SHIPPED_VOICE_NAMES } from "@adt/types"
import { formatElevenLabsVoiceLabel } from "./use-elevenlabs-voices"

describe("formatElevenLabsVoiceLabel", () => {
  it("includes the category and accent when present", () => {
    expect(
      formatElevenLabsVoiceLabel({
        voice_id: "v1",
        name: "Rachel",
        category: "premade",
        labels: { accent: "american" },
      })
    ).toBe("Rachel (premade, american)")
  })

  it("falls back to the bare name when there are no details", () => {
    expect(formatElevenLabsVoiceLabel({ voice_id: "v1", name: "Rachel" })).toBe("Rachel")
  })

  it("falls back to the ID when the voice has no name", () => {
    expect(formatElevenLabsVoiceLabel({ voice_id: "v1" })).toBe("v1")
  })
})

describe("ELEVENLABS_SHIPPED_VOICE_NAMES", () => {
  // The out-of-the-box default was rendering as a raw `21m00Tcm4TlvDq8ikWAM`,
  // because the name lookup needs the account's voice list, which is empty when
  // no ElevenLabs key is configured and may exclude premade library voices.
  it("names the default voice so it never renders as a raw ID", () => {
    expect(ELEVENLABS_SHIPPED_VOICE_NAMES[DEFAULT_ELEVENLABS_VOICE_ID]).toBe("Rachel")
  })

  // config/voices.yaml maps this to es-uy; a book on that locale would otherwise
  // show the raw ID too.
  it("names the Río de la Plata voice shipped for es-uy", () => {
    expect(ELEVENLABS_SHIPPED_VOICE_NAMES.QK4xDwo9ESPHA4JNUpX3).toBe("Tomás")
  })
})
