import { describe, expect, it } from "vitest"
import { detectPublishContext } from "./publish-context"

const TOKEN = "demoTokenDemoTokenDemoToken12345"

describe("detectPublishContext", () => {
  it("derives the api base from a share link", () => {
    expect(detectPublishContext(`/p/${TOKEN}/`)).toEqual({
      token: TOKEN,
      apiBase: `/p/${TOKEN}/`,
    })
  })

  it("works from any page inside the snapshot", () => {
    expect(detectPublishContext(`/p/${TOKEN}/pg017_sec001.html`)?.apiBase).toBe(`/p/${TOKEN}/`)
  })

  it("works from the bare token with no trailing slash", () => {
    expect(detectPublishContext(`/p/${TOKEN}`)?.apiBase).toBe(`/p/${TOKEN}/`)
  })

  it("stays inert on a plain local export", () => {
    expect(detectPublishContext("/books/raven/adt/index.html")).toBeNull()
    expect(detectPublishContext("/")).toBeNull()
    expect(detectPublishContext("/index.html")).toBeNull()
  })

  it("rejects a prefix that only looks like a share link", () => {
    expect(detectPublishContext("/p/short/index.html")).toBeNull()
    expect(detectPublishContext(`/pages/${TOKEN}/`)).toBeNull()
    expect(detectPublishContext(`/x/p/${TOKEN}/`)).toBeNull()
    expect(detectPublishContext(`/p/${"a".repeat(65)}/`)).toBeNull()
    expect(detectPublishContext(`/p/bad.token.with.dots.and.more.chars/`)).toBeNull()
  })
})
