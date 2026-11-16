import { describe, expect, it } from "vitest"
import {
  cacheControlFor,
  conditionalEtag,
  IMMUTABLE_CACHE_CONTROL,
  MEDIA_CACHE_CONTROL,
  NO_CACHE_CACHE_CONTROL,
  PRIVATE_IMMUTABLE_CACHE_CONTROL,
  PRIVATE_MEDIA_CACHE_CONTROL,
} from "./serve.js"

describe("conditionalEtag", () => {
  it("strips the quotes browsers echo back", () => {
    expect(conditionalEtag('"abc123"')).toBe("abc123")
  })

  it("strips a weak validator prefix", () => {
    expect(conditionalEtag('W/"abc123"')).toBe("abc123")
  })

  it("passes a bare etag through", () => {
    expect(conditionalEtag("abc123")).toBe("abc123")
  })

  it("falls back to unconditional for lists, wildcard and empty values", () => {
    expect(conditionalEtag('"a", "b"')).toBeUndefined()
    expect(conditionalEtag("*")).toBeUndefined()
    expect(conditionalEtag("  ")).toBeUndefined()
    expect(conditionalEtag(undefined)).toBeUndefined()
  })
})

describe("cacheControlFor", () => {
  it("serves hashed and other media assets public when the publication is open", () => {
    expect(cacheControlFor("assets/app.9f3a71c2.js", false)).toBe(IMMUTABLE_CACHE_CONTROL)
    expect(cacheControlFor("images/cover.png", false)).toBe(MEDIA_CACHE_CONTROL)
  })

  /** A gated publication must never let a shared cache — a CDN, a corporate proxy — hand its
   *  bytes to a requester the access gate never actually checked, so `public` becomes `private`
   *  with the same max-age and immutability otherwise untouched. */
  it("switches those same assets to private for a gated publication, without touching max-age", () => {
    expect(cacheControlFor("assets/app.9f3a71c2.js", true)).toBe(PRIVATE_IMMUTABLE_CACHE_CONTROL)
    expect(cacheControlFor("images/cover.png", true)).toBe(PRIVATE_MEDIA_CACHE_CONTROL)
  })

  it("leaves html and revalidate-on-every-fetch extensions at no-cache either way", () => {
    expect(cacheControlFor("index.html", false)).toBe(NO_CACHE_CACHE_CONTROL)
    expect(cacheControlFor("index.html", true)).toBe(NO_CACHE_CACHE_CONTROL)
    expect(cacheControlFor("data.json", false)).toBe(NO_CACHE_CACHE_CONTROL)
    expect(cacheControlFor("data.json", true)).toBe(NO_CACHE_CACHE_CONTROL)
  })
})
