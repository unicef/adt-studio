// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type {
  ReviewerPageValidationRecord,
  ReviewerValidationCatalogSnapshot,
  ReviewerValidationSession,
} from "@adt/types"

const navigateMock = vi.fn()
const routerMock = { state: { location: {} } }
let routeSearch: Record<string, unknown> = {}

const legacyCatalog: ReviewerValidationCatalogSnapshot = {
  identificationFields: [],
  instructions: [],
  pageSections: [{
    id: "text-extracted-accuracy",
    label: "Text extracted accuracy",
    criteria: [{
      id: "text-matches-original-reading-order",
      label: "Text matches the original reading order",
      guidance: "Check the reading order.",
      requires_comment_on_failure: true,
      requires_suggested_modification_on_failure: true,
    }],
  }],
}

let activeCatalog = legacyCatalog

const session: ReviewerValidationSession = {
  session_id: "session-1",
  reviewer_name: "Reviewer",
  catalog_snapshot: legacyCatalog,
}

const record: ReviewerPageValidationRecord = {
  session_id: "session-1",
  page_id: "pg001",
  section_id: "pg001_sec002",
  page_number: 1,
  href: "pg001_sec002.html",
  results: [{
    criterion_id: "text-matches-original-reading-order",
    status: "needs-changes",
    comment: "Reading order is incorrect.",
  }],
}

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouter: () => routerMock,
  useSearch: () => routeSearch,
}))

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ fetchQuery: ({ queryFn }: { queryFn: () => unknown }) => queryFn() }),
  useQueries: () => [{ data: { records: [{ version: 1, record }] }, isLoading: false, error: null }],
}))

function templateToString(strings: TemplateStringsArray, values: unknown[] = []) {
  let text = ""
  for (let index = 0; index < strings.length; index += 1) {
    text += strings[index]
    if (index < values.length) text += String(values[index])
  }
  return text
}

const i18n = {
  _: (value: unknown) => {
    if (typeof value === "string") return value
    if (value && typeof value === "object" && "id" in value) return String(value.id)
    return String(value ?? "")
  },
}

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    return { id: templateToString(strings, values) }
  },
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    i18n,
    t(value: TemplateStringsArray | { id?: string }, ...values: unknown[]) {
      return Array.isArray(value)
        ? templateToString(value as unknown as TemplateStringsArray, values)
        : String((value as { id?: string }).id ?? "")
    },
  }),
}))

vi.mock("@/api/client", () => ({ api: { getPages: async () => [{ pageId: "pg001", sections: [
 { sectionId: "pg001_sec001", isPruned: false, hasStableId: true },
 { sectionId: "pg001_sec002", isPruned: false, hasStableId: true },
] }] } }))

vi.mock("@/hooks/use-reviewer-validation", () => ({
  useReviewerValidationCatalog: () => ({
    data: { enabled: true, ...activeCatalog },
    isLoading: false,
    error: null,
  }),
  useReviewerValidationSessions: () => ({
    data: { sessions: [{ version: 1, session }] },
    isLoading: false,
    error: null,
  }),
}))

vi.mock("@/hooks/use-debug", () => ({
  useAccessibilityAssessment: () => ({
    data: { assessment: { summary: { pageCount: 1 } } },
    isLoading: false,
    error: null,
  }),
}))

afterEach(() => {
  cleanup()
  routeSearch = {}
  navigateMock.mockClear()
  activeCatalog = legacyCatalog
  session.catalog_snapshot = legacyCatalog
  window.sessionStorage.clear()
})

describe("ReviewerValidationSummaryTab", () => {
  it("routes a finding from a historical checklist snapshot to its exact Sectioning section", async () => {
    const { ReviewerValidationSummaryTab } = await import("./ReviewerValidationSummaryTab")
    render(<ReviewerValidationSummaryTab label="demo-book" />)

    const openButton = await screen.findByRole("button", { name: "Open pg001_sec002 in Sectioning" })
    fireEvent.click(openButton)

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$label/$step/$pageId",
      params: { label: "demo-book", step: "sectioning", pageId: "pg001" },
      hash: true,
      search: expect.objectContaining({ sectionId: "pg001_sec002", validationReturn: expect.objectContaining({ sessionId: "session-1" }) }),
    }))
  })
  it("keeps snapshot ownership after active checklist edits and allows a temporary override", async () => {
    activeCatalog = { ...legacyCatalog, pageSections: legacyCatalog.pageSections.map((section) => ({
      ...section, fix_stage: "speech", criteria: section.criteria.map((criterion) => ({ ...criterion, fix_stage: "extract" })),
    })) }
    const { ReviewerValidationSummaryTab } = await import("./ReviewerValidationSummaryTab")
    render(<ReviewerValidationSummaryTab label="demo-book" />)
    expect(await screen.findByRole("button", { name: "Open pg001_sec002 in Sectioning" })).toBeTruthy()
    fireEvent.change(screen.getByRole("combobox", { name: "Fix destination" }), { target: { value: "captions" } })
    fireEvent.click(screen.getByRole("button", { name: "Open pg001_sec002 in Image Captions" }))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$label/$step", params: { label: "demo-book", step: "captions" },
      hash: true,
      search: expect.objectContaining({ validationReturn: expect.objectContaining({ sessionId: "session-1" }) }),
    }))
    expect(session.catalog_snapshot).toBe(legacyCatalog)
    expect(record.results[0].status).toBe("needs-changes")
  })

  it("does not take legacy session ownership from the mutable current checklist", async () => {
    session.catalog_snapshot = undefined
    activeCatalog = { ...legacyCatalog, pageSections: legacyCatalog.pageSections.map((section) => ({ ...section, fix_stage: "speech" })) }
    const { ReviewerValidationSummaryTab } = await import("./ReviewerValidationSummaryTab")
    render(<ReviewerValidationSummaryTab label="demo-book" />)
    expect(await screen.findByRole("button", { name: "Open pg001_sec002 in Sectioning" })).toBeTruthy()
  })

})

it("explains a missing source session and offers the available historical review", async () => {
  routeSearch = { validationContext: { tab: "reviewer-validation", sessionId: "deleted-session" } }
  const { ReviewerValidationSummaryTab } = await import("./ReviewerValidationSummaryTab")
  render(<ReviewerValidationSummaryTab label="demo-book" />)
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "The original reviewer session is no longer available. Showing available reviews.")
  expect(await screen.findByRole("button", { name: "Open pg001_sec002 in Sectioning" })).toBeTruthy()
  expect(record.results[0].status).toBe("needs-changes")
  expect(navigateMock).not.toHaveBeenCalled()
})

it("does not relabel historical answers from an edited live catalog when the session has no snapshot", async () => {
  session.catalog_snapshot = undefined
  activeCatalog = { ...legacyCatalog, pageSections: legacyCatalog.pageSections.map((section) => ({
    ...section, criteria: section.criteria.map((criterion) => ({ ...criterion, label: "New unrelated criterion meaning" })),
  })) }
  const { ReviewerValidationSummaryTab } = await import("./ReviewerValidationSummaryTab")
  render(<ReviewerValidationSummaryTab label="demo-book" />)
  expect(screen.queryByText("New unrelated criterion meaning")).toBeNull()
  expect(screen.getByText("text-matches-original-reading-order")).toBeTruthy()
})
