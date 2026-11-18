import { describe, expect, it } from "vitest"
import {
  ElementAudioOutput,
  elementAudioTextId,
  isElementAudioNodeId,
  isElementAudioTextId,
  parseElementAudioTextId,
} from "../element-audio.js"

describe("ElementAudioOutput", () => {
  it("AC-14: round-trips entries", () => {
    const value = {
      entries: [{ nodeId: "pg001_im001", text: "Mago" }],
      generatedAt: "2026-11-16T00:00:00.000Z",
    }
    expect(ElementAudioOutput.parse(value)).toEqual(value)
  })

  it("AC-1: rejects an empty nodeId", () => {
    const result = ElementAudioOutput.safeParse({
      entries: [{ nodeId: "", text: "x" }],
      generatedAt: "t",
    })
    expect(result.success).toBe(false)
  })

  it("AC-1: accepts an empty text — the save path decides what an emptied script means", () => {
    const result = ElementAudioOutput.safeParse({
      entries: [{ nodeId: "pg001_im001", text: "" }],
      generatedAt: "t",
    })
    expect(result.success).toBe(true)
  })

  it("AC-19: rejects duplicate nodeIds", () => {
    const result = ElementAudioOutput.safeParse({
      entries: [
        { nodeId: "pg001_im001", text: "Mago" },
        { nodeId: "pg001_im001", text: "Maga" },
      ],
      generatedAt: "t",
    })
    expect(result.success).toBe(false)
  })
})

describe("elementAudioTextId", () => {
  it("AC-19: suffixes the element id with _audio", () => {
    expect(elementAudioTextId("pg001_im001")).toBe("pg001_im001_audio")
  })

  it("AC-19: does not collide with the element's own id or its _easy_read variant", () => {
    const id = elementAudioTextId("pg001_im001")
    expect(id).not.toBe("pg001_im001")
    expect(id).not.toBe("pg001_im001_easy_read")
  })

  it("AC-19: does not collide with reserved answer/quiz/glossary suffixes", () => {
    const id = elementAudioTextId("pg001_im001")
    for (const suffix of ["_def", "_que", "_exp", "_o1", "--secondary"]) {
      expect(id).not.toBe(`pg001_im001${suffix}`)
    }
  })

  it("AC-19: round-trips through parseElementAudioTextId", () => {
    expect(parseElementAudioTextId(elementAudioTextId("pg001_im001"))).toBe("pg001_im001")
    expect(parseElementAudioTextId("pg001_im001_crop_v1_audio")).toBe("pg001_im001_crop_v1")
    expect(isElementAudioTextId(elementAudioTextId("pg001_im001"))).toBe(true)
  })

  it("AC-24: only image ids are treated as synthetic (v1 scope)", () => {
    expect(isElementAudioTextId("pg001_im001_audio")).toBe(true)
    expect(isElementAudioTextId("pg001_im1000_audio")).toBe(true)
    expect(isElementAudioTextId("pg001_listen_audio")).toBe(false)
    expect(isElementAudioTextId("pg001_t001_audio")).toBe(false)
    expect(parseElementAudioTextId("pg001_listen_audio")).toBeNull()
  })

  it("AC-1/A6: the write path accepts image node ids only", () => {
    expect(isElementAudioNodeId("pg001_im001")).toBe(true)
    expect(isElementAudioNodeId("pg001_im1000_crop_v1")).toBe(true)
    // A pre-existing legacy image id ending in `_audio` stays authorable.
    expect(isElementAudioNodeId("pg001_im001_audio")).toBe(true)
    expect(isElementAudioNodeId("pg001_t001")).toBe(false)
    expect(isElementAudioNodeId("pg001_listen")).toBe(false)
  })

  it("AC-19: returns null for ids that are not element-audio ids", () => {
    expect(parseElementAudioTextId("pg001_t001")).toBeNull()
    expect(parseElementAudioTextId("pg001_im001_easy_read")).toBeNull()
    expect(parseElementAudioTextId("_audio")).toBeNull()
    expect(isElementAudioTextId("pg001_t001")).toBe(false)
  })
})
