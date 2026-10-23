import { describe, expect, it } from "vitest"
import { elementKindOf } from "./useSelectedElementStyle"

describe("elementKindOf", () => {
  it("recognises images by tag or id", () => {
    expect(elementKindOf({ dataId: "pg008_im001", tagName: "img" })).toBe("image")
    expect(elementKindOf({ dataId: "pg008_im001" })).toBe("image")
  })

  it("recognises containers by transient id or wrapper tag", () => {
    expect(elementKindOf({ dataId: "_el3", tagName: "div" })).toBe("container")
    expect(elementKindOf({ dataId: "_sec1", tagName: "section" })).toBe("container")
  })

  it("treats everything else as text", () => {
    expect(elementKindOf({ dataId: "pg008_gp001_tx001", tagName: "p" })).toBe("text")
    expect(elementKindOf({ dataId: "pg008_tx002" })).toBe("text")
  })
})
