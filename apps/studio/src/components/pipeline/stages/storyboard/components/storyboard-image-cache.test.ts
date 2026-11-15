import { describe, expect, it } from "vitest"
import { applyStoryboardImageCachePolicy, toStoredImageSources } from "./storyboard-image-cache"

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

describe("toStoredImageSources", () => {
  // What BookPreviewFrame shows on desktop: the session's API origin + cache policy.
  const toDisplay = (html: string, baseUrl: string, label: string) =>
    applyStoryboardImageCachePolicy(
      toStoredImageSources(html).replace(
        /src=(["'])\/api\/books\/[^/"']+\/images\//g,
        `src=$1${baseUrl}/books/${label}/images/`,
      ),
    )

  it("drops the desktop API origin and the cache-policy query before saving", () => {
    expect(
      toStoredImageSources(
        '<img data-id="pg002_im002" src="http://127.0.0.1:53951/api/books/raven-2/images/pg002_im002?cache-policy=revalidate-v1" class="rounded-xl">',
      ),
    ).toBe('<img data-id="pg002_im002" src="/api/books/raven-2/images/pg002_im002" class="rounded-xl">')
  })

  it("survives a restart: the saved HTML no longer depends on the session port", () => {
    const stored = '<div id="content"><img data-id="pg002_im002" src="/api/books/raven/images/pg002_im002"></div>'
    const firstSession = toDisplay(stored, "http://127.0.0.1:53951/api", "raven-2")
    expect(firstSession).toContain("http://127.0.0.1:53951/")
    const saved = toStoredImageSources(firstSession)
    expect(saved).toBe('<div id="content"><img data-id="pg002_im002" src="/api/books/raven-2/images/pg002_im002"></div>')
    const secondSession = toDisplay(saved, "http://127.0.0.1:54397/api", "raven-2")
    expect(secondSession).toContain('src="http://127.0.0.1:54397/api/books/raven-2/images/pg002_im002?cache-policy=revalidate-v1"')
    expect(secondSession).not.toContain("53951")
  })

  it("repairs a section that was already saved with an old session's port", () => {
    const damaged = "<img src='http://127.0.0.1:53951/api/books/raven-2/images/pg002_im002?cache-policy=revalidate-v1'>"
    expect(toDisplay(damaged, "http://127.0.0.1:54397/api", "raven-2")).toBe(
      "<img src='http://127.0.0.1:54397/api/books/raven-2/images/pg002_im002?cache-policy=revalidate-v1'>",
    )
  })

  it("leaves web-relative links, other queries and unrelated sources alone", () => {
    const html =
      '<img src="/api/books/raven-2/images/a"><img src="https://cdn.example.com/api/books/x/images/y"><img src="/api/books/raven-2/images/b?v=2"><img src="images/local.png">'
    expect(toStoredImageSources(html)).toBe(html)
  })
})
