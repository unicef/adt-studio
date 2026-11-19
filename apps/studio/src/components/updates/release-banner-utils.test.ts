import { describe, expect, it } from "vitest"
import { previewPullRequestNumber, trustedAssetUrl } from "./release-banner-utils"

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

describe("previewPullRequestNumber", () => {
  it("reads the PR of a staging build", () => {
    expect(previewPullRequestNumber("0.8.1-beta-pr-867")).toBe(867)
  })

  it("reads the PR of a rebuild of a staging build", () => {
    expect(previewPullRequestNumber("0.8.1-beta-pr-867.2")).toBe(867)
    expect(previewPullRequestNumber("v0.8.1-beta-pr-867.12")).toBe(867)
  })

  it("ignores numbered betas and stable releases", () => {
    expect(previewPullRequestNumber("0.8.0-beta.1")).toBeUndefined()
    expect(previewPullRequestNumber("0.8.0")).toBeUndefined()
    expect(previewPullRequestNumber("0.8.1-beta-pr-867.x")).toBeUndefined()
  })
})
