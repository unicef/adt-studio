import { describe, expect, it } from "vitest"
import { errorRates } from "./evaluate-adt-tts.mjs"

describe("ADT TTS evaluation", () => {
  it("computes language-agnostic WER and CER", () => {
    expect(errorRates("Momo climbed the tree", "Momo climbed tree").wer).toBe(0.25)
    expect(errorRates("ação", "acao").cer).toBe(0.5)
  })
})
