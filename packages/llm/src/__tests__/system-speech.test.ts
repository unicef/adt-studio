import { describe, expect, it } from "vitest"
import {
  createMacSystemTTSSynthesizer,
  isMacSystemSpeechAvailable,
} from "../system-speech.js"

describe.skipIf(process.platform !== "darwin")("macOS system speech", () => {
  it("exports canonical PCM WAV without a network service", async () => {
    expect(isMacSystemSpeechAvailable()).toBe(true)
    const bytes = await createMacSystemTTSSynthesizer().synthesize({
      model: "apple-speech",
      voice: "Samantha",
      input: "Momo climbed the tree.",
      language: "en",
      responseFormat: "wav",
    })
    expect(Buffer.from(bytes).toString("ascii", 0, 4)).toBe("RIFF")
    expect(bytes.byteLength).toBeGreaterThan(44)
  })

  it("rejects non-WAV output", async () => {
    await expect(createMacSystemTTSSynthesizer().synthesize({
      model: "apple-speech",
      voice: "Samantha",
      input: "Momo",
      responseFormat: "mp3",
    })).rejects.toThrow("WAV")
  })
})
