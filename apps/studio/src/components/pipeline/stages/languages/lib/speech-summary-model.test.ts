import { describe, it, expect } from "vitest"
import { summarySpeechModel } from "./speech-summary-model"

describe("summarySpeechModel", () => {
  it("does not show a Gemini global id on an OpenAI book (#977)", () => {
    expect(summarySpeechModel("openai", {}, "gemini-2.5-pro-preview-tts")).toBe("gpt-4o-mini-tts")
  })

  it("shows a Gemini global id on a Gemini book", () => {
    expect(summarySpeechModel("gemini", {}, "gemini-3.1-flash-tts-preview")).toBe(
      "gemini-3.1-flash-tts-preview",
    )
  })

  it("falls back to the pipeline's Gemini default, flash", () => {
    expect(summarySpeechModel("gemini", {}, undefined)).toBe("gemini-2.5-flash-preview-tts")
    expect(summarySpeechModel("gemini", {}, "gpt-4o-mini-tts")).toBe("gemini-2.5-flash-preview-tts")
  })

  it("lets the per-provider model win over the global id", () => {
    expect(
      summarySpeechModel(
        "gemini",
        { providers: { gemini: { model: "gemini-2.5-pro-preview-tts" } } },
        "gemini-3.1-flash-tts-preview",
      ),
    ).toBe("gemini-2.5-pro-preview-tts")
  })

  it("prefers the book's speech.model over the global default, like the runtime", () => {
    expect(summarySpeechModel("openai", { model: "tts-1-hd" }, "gpt-4o-mini-tts")).toBe("tts-1-hd")
    expect(summarySpeechModel("gemini", { model: "tts-1-hd" }, "gemini-2.5-pro-preview-tts")).toBe(
      "gemini-2.5-flash-preview-tts",
    )
  })

  it("passes an id of unknown shape through for OpenAI only", () => {
    expect(summarySpeechModel("openai", {}, "my-custom-tts")).toBe("my-custom-tts")
    expect(summarySpeechModel("azure", {}, "my-custom-tts")).toBe("azure-tts")
  })
})
