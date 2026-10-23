import { describe, expect, it } from "vitest"
import { imageFileExtension } from "../image.js"

describe("imageFileExtension", () => {
  it.each([
    ["image/png", "png"], ["image/jpeg", "jpg"], ["image/jpg", "jpg"],
    ["IMAGE/JPEG", "jpg"], ["image/webp", "webp"], ["image/gif", "gif"],
    [undefined, "png"], ["unknown", "png"], ["", "png"], ["constructor", "png"], ["__proto__", "png"],
  ])("maps %s to %s, retaining the legacy PNG fallback", (mime, extension) => {
    expect(imageFileExtension(mime)).toBe(extension)
  })
})
