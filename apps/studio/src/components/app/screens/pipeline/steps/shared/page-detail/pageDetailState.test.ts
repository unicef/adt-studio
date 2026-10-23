import { describe, expect, it } from "vitest"
import { pageDetailState, refreshFailed } from "./pageDetailState"

const query = (isPending: boolean, isError: boolean) => ({ isPending, isError, refetch: () => undefined })

describe("pageDetailState", () => {
  it("shows an error, never an endless loader, when the page fetch failed", () => {
    expect(pageDetailState(query(false, true), false)).toBe("error")
    expect(pageDetailState(query(true, true), false)).toBe("error")
  })

  it("loads, then shows the items or the empty message", () => {
    expect(pageDetailState(query(true, false), false)).toBe("loading")
    expect(pageDetailState(query(false, false), true)).toBe("empty")
    expect(pageDetailState(query(false, false), false)).toBe("ready")
  })

  it("keeps a loaded page on screen when a background refetch fails", () => {
    const failedRefetch = { isPending: false, isError: true, data: { pageId: "pg001" }, refetch: () => undefined }
    expect(pageDetailState(failedRefetch, false)).toBe("ready")
    expect(refreshFailed(failedRefetch)).toBe(true)
    expect(refreshFailed(query(false, true))).toBe(false)
  })
})
