// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import type { GlossaryItem } from "@/api/client"

const catalog = {
  entries: [
    {
      id: "pg001_n0001",
      text: "The Mago appears twice: Mago.",
      locations: [{ pageId: "pg001" }],
    },
    {
      // Authored element audio: same word, but not page text.
      id: "pg001_im001_audio",
      text: "Mago",
      locations: [{ pageId: "pg001", sectionId: "pg001_sec001", role: "element-audio" }],
    },
  ],
}

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: catalog, isLoading: false }),
}))
vi.mock("@/hooks/use-pages", () => ({
  usePages: () => ({
    data: [{ pageId: "pg001", pageNumber: 1 }],
    isLoading: false,
  }),
}))

const { useGlossaryOccurrences } = await import("./occurrences")

describe("useGlossaryOccurrences (SPEC-0014)", () => {
  it("does not count an authored element script as page text", () => {
    const item = { id: "g1", word: "Mago", variations: [] } as GlossaryItem
    const { result } = renderHook(() => useGlossaryOccurrences("book", [item]))

    expect(result.current.byItem.get("g1")).toEqual({ count: 2, pages: [1] })
  })
})
