import { describe, expect, it } from "vitest"
import { previewCoverDataUri } from "./preview-cover.js"

describe("previewCoverDataUri", () => {
  it("keeps the original when the image can't be read", () => {
    expect(previewCoverDataUri({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mimeType: "image/png" }))
      .toBe("data:image/png;base64,iVBORw==")
  })

  it("returns null without a cover", () => {
    expect(previewCoverDataUri(null)).toBeNull()
  })
})
