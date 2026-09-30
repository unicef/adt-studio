import { describe, expect, it } from "vitest"
import { trustedAssetUrl } from "./release-banner-utils"

describe("trustedAssetUrl", () => {
  it("accepts ADT Studio release assets", () => {
    const url =
      "https://github.com/unicef/adt-studio/releases/download/v0.8.0/release-cover-light.png"

    expect(trustedAssetUrl(url)).toBe(url)
  })

  it("rejects release assets from other repositories", () => {
    expect(
      trustedAssetUrl(
        "https://github.com/other/project/releases/download/v1/cover.png",
      ),
    ).toBeUndefined()
  })
})
