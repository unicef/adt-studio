// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

const navigateMock = vi.fn()
const searchMock = vi.fn(() => ({ previewHref: "chapter.html", sectionId: "pg001_sec002" }))
const scrollIntoViewMock = vi.fn()

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchMock(),
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), "")
    },
  }),
}))

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    return {
      id: strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), ""),
    }
  },
}))

vi.mock("@lingui/core", () => ({
  i18n: {
    _: (value: unknown) => value && typeof value === "object" && "id" in value
      ? String(value.id)
      : String(value ?? ""),
  },
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock("@/api/client", () => ({ api: {} }))

vi.mock("@/hooks/use-pages", () => ({
  usePageImage: () => ({ data: null }),
}))

vi.mock("@/hooks/use-page-mutations", () => ({
  invalidateStoryboardDependents: vi.fn(),
}))

vi.mock("../../components/StepViewRouter", () => ({
  useStepHeader: () => ({ headerSlotEl: null }),
}))

vi.mock("@/components/section-tree-editor/SectionTreeEditor", () => ({
  SectionTreeEditor: ({ section }: { section: { sectionId: string } }) => <div>{section.sectionId}-tree</div>,
}))

vi.mock("@/components/pipeline/stages/storyboard/components/SectionActionsDropdown", () => ({
  SectionActionsDropdown: () => <div>section-actions</div>,
}))

vi.mock("@/components/ui/sonner", () => ({
  toast: { warning: vi.fn() },
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const page = {
  pageId: "pg001",
  sectioningTree: {
    reasoning: "",
    sections: [
      { sectionId: "pg001_sec001", sectionType: "content", nodes: [] },
      { sectionId: "pg001_sec002", sectionType: "content", nodes: [] },
    ],
  },
}

beforeEach(() => {
  navigateMock.mockClear()
  scrollIntoViewMock.mockClear()
  searchMock.mockReturnValue({ previewHref: "chapter.html", sectionId: "pg001_sec002" })
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoViewMock,
  })
})

afterEach(cleanup)

describe("SectioningPageDetail validation section focus", () => {
  it("scrolls to the stable section id and consumes only the one-shot search value", async () => {
    const { SectioningPageDetail } = await import("./SectioningPageDetail")
    render(
      <SectioningPageDetail
        bookLabel="demo-book"
        pageId="pg001"
        page={page as never}
        navigationExtra={null}
        navigationArrows={null}
      />,
    )

    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    }))
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$label/$step/$pageId",
      params: { label: "demo-book", step: "sectioning", pageId: "pg001" },
      search: { previewHref: "chapter.html", sectionId: undefined },
      replace: true,
    })
  })
})
