// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ApiError, type PageDetail } from "@/api/client"
import { useStoryboardDraft } from "./use-storyboard-draft"

const { getPage, setQueryData } = vi.hoisted(() => ({ getPage: vi.fn(), setQueryData: vi.fn() }))
vi.mock("@/api/client", async (original) => ({ ...await original<typeof import("@/api/client")>(), api: { getPage } }))
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ setQueryData }) }))

const page = {
  pageId: "p1", versions: { sectioning: 1, rendering: 4 },
  sectioningTree: { reasoning: "", sections: [{ sectionId: "s7", sectionType: "text", nodes: [{ nodeId: "text1", role: "text", text: "Original" }] }] },
  rendering: { sections: [{ sectionId: "s7", sectionIndex: 0, html: '<p data-id="text1">Original</p>' }] },
} as unknown as PageDetail
const source = { ...page.sectioningTree!, reasoning: "My draft" }

describe("Storyboard atomic editor draft", () => {
  it("captures both versions when a rendering-only edit begins and keeps them across query refresh", () => {
    const { result, rerender } = renderHook(({ data }) => useStoryboardDraft("book", "p1", data), { initialProps: { data: page } })
    const rendering = { ...page.rendering!, sections: [{ ...page.rendering!.sections[0], html: "My HTML" }] }
    act(() => result.current.setRendering(rendering))
    rerender({ data: { ...page, versions: { ...page.versions, sectioning: 2, rendering: 5 } } })
    expect(result.current.baseVersion).toBe(1)
    expect(result.current.baseCompanionVersion).toBe(4)
    expect(result.current.sectioning).toBeNull()
    expect(result.current.rendering).toEqual(rendering)
  })

  it("retains simultaneous source and rendering edits through failed saves and requires a choice for overlapping HTML", async () => {
    const { result } = renderHook(() => useStoryboardDraft("book", "p1", page))
    act(() => result.current.setSectioning(source))
    act(() => result.current.setRendering({ ...page.rendering!, sections: [{ ...page.rendering!.sections[0], html: "My HTML" }] }))
    await act(() => result.current.handleError(new Error("Lost response")))
    expect(result.current.sectioning).toEqual(source)
    getPage.mockResolvedValue({ ...page, versions: { sectioning: 1, rendering: 5 }, rendering: { sections: [{ ...page.rendering!.sections[0], html: "Concurrent HTML" }] } })
    await act(() => result.current.handleError(new ApiError("Version conflict", 409)))
    expect(result.current.conflict?.paths).toContain("/rendering/sections/s7/html")
    expect(result.current.rendering?.sections[0].html).toBe("My HTML")
    act(() => result.current.resolve("latest"))
    expect(result.current.sectioning).toEqual(source)
    expect(result.current.rendering?.sections[0].html).toBe("Concurrent HTML")
    expect(result.current.baseCompanionVersion).toBe(5)
  })

  it("never clears a new page draft when the old page save completes late", () => {
    const { result, rerender } = renderHook(({ id, data }) => useStoryboardDraft("book", id, data), { initialProps: { id: "p1", data: page } })
    act(() => result.current.setSectioning(source))
    const ticket = result.current.captureSave()
    rerender({ id: "p2", data: { ...page, pageId: "p2", versions: { ...page.versions, sectioning: 8, rendering: 9 } } })
    act(() => result.current.setSectioning({ ...source, reasoning: "Second page" }))
    act(() => { expect(result.current.completeSave(ticket, 2, 5)).toBe(false) })
    expect(result.current.sectioning?.reasoning).toBe("Second page")
    expect(result.current.baseVersion).toBe(8)
    expect(result.current.baseCompanionVersion).toBe(9)
  })
})
