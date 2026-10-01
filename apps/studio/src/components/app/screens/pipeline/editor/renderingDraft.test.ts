import { describe, expect, it } from "vitest"
import {
  NO_DRAFTS,
  applyDrafts,
  hasDrafts,
  imageUrlCodec,
  withDraft,
  type RenderingData,
} from "./renderingDraft"

const rendering: RenderingData = {
  sections: [
    { sectionIndex: 0, sectionType: "story", reasoning: "", html: "<p>one</p>" },
    { sectionIndex: 1, sectionType: "story", reasoning: "", html: "<p>two</p>" },
  ],
}

describe("imageUrlCodec", () => {
  it("leaves html alone when the API is served from the same origin", () => {
    const codec = imageUrlCodec("/api")
    const html = '<img src="/api/books/b/images/i1">'
    expect(codec.toCanvas(html)).toBe(html)
    expect(codec.fromCanvas(html)).toBe(html)
  })

  it("makes image sources absolute for the canvas and relative again for storage", () => {
    const codec = imageUrlCodec("http://127.0.0.1:3001/api")
    const stored = '<img src="/api/books/b/images/i1"><img src=\'/api/books/b/images/i2\'>'
    const canvas = codec.toCanvas(stored)
    expect(canvas).toBe(
      '<img src="http://127.0.0.1:3001/api/books/b/images/i1"><img src=\'http://127.0.0.1:3001/api/books/b/images/i2\'>',
    )
    expect(codec.fromCanvas(canvas)).toBe(stored)
  })

  it("does not touch sources that point elsewhere", () => {
    const codec = imageUrlCodec("http://127.0.0.1:3001/api")
    const html = '<img src="https://example.com/api/x.png"><a href="/api/books">x</a>'
    expect(codec.toCanvas(html)).toBe(html)
  })
})

describe("withDraft", () => {
  it("records html that differs from the baseline", () => {
    expect(withDraft(NO_DRAFTS, 1, "<p>edited</p>", "<p>two</p>")).toEqual({ 1: "<p>edited</p>" })
  })

  it("drops the draft once the html is back at the baseline", () => {
    const drafts = withDraft(NO_DRAFTS, 1, "<p>edited</p>", "<p>two</p>")
    expect(withDraft(drafts, 1, "<p>two</p>", "<p>two</p>")).toEqual({})
  })

  it("returns the same object when nothing changes", () => {
    const drafts = withDraft(NO_DRAFTS, 1, "<p>edited</p>", "<p>two</p>")
    expect(withDraft(drafts, 1, "<p>edited</p>", "<p>two</p>")).toBe(drafts)
    expect(withDraft(NO_DRAFTS, 0, "<p>one</p>", "<p>one</p>")).toBe(NO_DRAFTS)
  })

  it("keeps other sections' drafts", () => {
    const drafts = withDraft(withDraft(NO_DRAFTS, 0, "<p>a</p>", ""), 1, "<p>b</p>", "")
    expect(withDraft(drafts, 0, "", "")).toEqual({ 1: "<p>b</p>" })
    expect(hasDrafts(drafts)).toBe(true)
    expect(hasDrafts(NO_DRAFTS)).toBe(false)
  })
})

describe("applyDrafts", () => {
  it("replaces only the drafted sections and converts them back to storage form", () => {
    const codec = imageUrlCodec("http://127.0.0.1:3001/api")
    const next = applyDrafts(
      rendering,
      { 1: '<img src="http://127.0.0.1:3001/api/books/b/images/i1">' },
      codec,
    )
    expect(next.sections[0]).toBe(rendering.sections[0])
    expect(next.sections[1]).toEqual({
      sectionIndex: 1,
      sectionType: "story",
      reasoning: "",
      html: '<img src="/api/books/b/images/i1">',
    })
  })
})
