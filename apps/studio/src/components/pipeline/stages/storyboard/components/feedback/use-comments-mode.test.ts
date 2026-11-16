// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useCommentsMode } from "./use-comments-mode"

describe("useCommentsMode", () => {
  /** The page list and the page are separate trees; one switch has to reach both. */
  it("is the same switch wherever it is read", () => {
    const list = renderHook(() => useCommentsMode("book-a"))
    const page = renderHook(() => useCommentsMode("book-a"))
    act(() => list.result.current.setOn(true))
    expect(page.result.current.on).toBe(true)
    act(() => page.result.current.setOn((on) => !on))
    expect(list.result.current.on).toBe(false)
  })

  it("keeps books apart", () => {
    const a = renderHook(() => useCommentsMode("book-b"))
    const b = renderHook(() => useCommentsMode("book-c"))
    act(() => a.result.current.setOn(true))
    expect(b.result.current.on).toBe(false)
  })

  /** Asking for the comment that was just closed has to open it again. */
  it("turns the mode on and re-asks for the same comment every time", () => {
    const { result } = renderHook(() => useCommentsMode("book-d"))
    act(() => result.current.open("c1", "pg001_sec001"))
    expect(result.current.on).toBe(true)
    const first = result.current.request
    act(() => result.current.consume())
    expect(result.current.request).toBeNull()
    act(() => result.current.open("c1", "pg001_sec001"))
    expect(result.current.request?.threadId).toBe("c1")
    expect(result.current.request).not.toBe(first)
  })
})
