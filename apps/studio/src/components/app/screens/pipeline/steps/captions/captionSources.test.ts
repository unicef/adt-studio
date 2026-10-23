import { describe, expect, it } from "vitest"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { stampSources } from "./captionSources"

const entry = (imageId: string, caption: string, extra: Partial<CaptionEntry> = {}): CaptionEntry => ({
  imageId,
  caption,
  reasoning: "",
  source: "ai",
  ...extra,
})

describe("stampSources", () => {
  it("marks only the images that differ from the saved copy as edited by you", () => {
    const server = [entry("a", "Cat"), entry("b", "Dog")]
    const next = [entry("a", "Cat on a mat"), entry("b", "Dog")]
    const saved = stampSources(next, server)
    expect(saved[0].source).toBe("manual")
    expect(saved[1].source).toBe("ai")
  })

  it("keeps the AI source on an image toggled decorative and back while another image changes", () => {
    const server = [entry("a", "Cat"), entry("b", "Dog")]
    const toggledBack = { ...entry("b", "Dog"), decorative: false, source: "manual" as const }
    const saved = stampSources([entry("a", "Kitten", { source: "manual" }), toggledBack], server)
    expect(saved[1]).toEqual(server[1])
    expect(saved[1].source).toBe("ai")
    expect(saved[0].source).toBe("manual")
  })

  it("marks a decorative switch as an edit", () => {
    const server = [entry("a", "Cat")]
    expect(stampSources([entry("a", "Cat", { decorative: true })], server)[0].source).toBe("manual")
  })
})
