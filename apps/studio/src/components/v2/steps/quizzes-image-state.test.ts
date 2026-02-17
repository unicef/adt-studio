import { describe, expect, it } from "vitest"
import { getQuizImageRenderState, getRequestedPageId } from "./quizzes-image-state"

describe("getRequestedPageId", () => {
  it("returns empty page id when image is not requested", () => {
    expect(getRequestedPageId("pg001", false)).toBe("")
  })

  it("returns source page id when image is requested", () => {
    expect(getRequestedPageId("pg001", true)).toBe("pg001")
  })
})

describe("getQuizImageRenderState", () => {
  it("returns idle before a request starts", () => {
    expect(
      getQuizImageRenderState({
        isRequested: false,
        isLoading: false,
        isError: false,
        hasImage: false,
      })
    ).toBe("idle")
  })

  it("returns loading while query is in progress", () => {
    expect(
      getQuizImageRenderState({
        isRequested: true,
        isLoading: true,
        isError: false,
        hasImage: false,
      })
    ).toBe("loading")
  })

  it("returns error when query fails", () => {
    expect(
      getQuizImageRenderState({
        isRequested: true,
        isLoading: false,
        isError: true,
        hasImage: false,
      })
    ).toBe("error")
  })

  it("returns ready when image payload exists", () => {
    expect(
      getQuizImageRenderState({
        isRequested: true,
        isLoading: false,
        isError: false,
        hasImage: true,
      })
    ).toBe("ready")
  })
})
