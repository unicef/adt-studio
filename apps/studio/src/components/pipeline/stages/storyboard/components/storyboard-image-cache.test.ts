import { describe, expect, it } from "vitest"
import { applyStoryboardImageCachePolicy } from "./storyboard-image-cache"

describe("applyStoryboardImageCachePolicy", () => {
  it("moves relative book images to the revalidating cache namespace", () => {
    expect(
      applyStoryboardImageCachePolicy(
        '<img src="/api/books/raven-2/images/pg003_im002" alt="Raven">',
      ),
    ).toBe(
      '<img src="/api/books/raven-2/images/pg003_im002?cache-policy=revalidate-v1" alt="Raven">',
    )
  })

  it("replaces an older image query without changing unrelated sources", () => {
    expect(
      applyStoryboardImageCachePolicy(
        "<img src='http://localhost:3003/api/books/raven-2/images/pg003_im002?v=2'><img src='images/local.png'>",
      ),
    ).toBe(
      "<img src='http://localhost:3003/api/books/raven-2/images/pg003_im002?cache-policy=revalidate-v1'><img src='images/local.png'>",
    )
  })
})
