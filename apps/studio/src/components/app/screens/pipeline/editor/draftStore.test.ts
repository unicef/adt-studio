import { describe, expect, it } from "vitest"
import { clearDrafts, getDrafts, setDraft } from "./draftStore"

describe("draftStore", () => {
  it("keeps drafts per page and drops them when the html returns to the baseline", () => {
    setDraft("pg001", 0, "<p>edited</p>", "<p>base</p>")
    expect(getDrafts("pg001")).toEqual({ 0: "<p>edited</p>" })
    expect(getDrafts("pg002")).toEqual({})

    setDraft("pg001", 0, "<p>base</p>", "<p>base</p>")
    expect(getDrafts("pg001")).toEqual({})
  })

  it("forgets another page's drafts when a new page is edited", () => {
    setDraft("pg001", 0, "<p>a</p>", "")
    setDraft("pg002", 1, "<p>b</p>", "")
    expect(getDrafts("pg001")).toEqual({})
    expect(getDrafts("pg002")).toEqual({ 1: "<p>b</p>" })
    clearDrafts("pg002")
    expect(getDrafts("pg002")).toEqual({})
  })
})
