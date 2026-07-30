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
}))

vi.mock("@tanstack/react-query", () => ({
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

vi.mock("@/api/client", () => ({ api: {} }))

vi.mock("@/hooks/use-reviewer-validation", () => ({
  useReviewerValidationCatalog: () => ({
    data: { enabled: true, ...legacyCatalog },
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
  navigateMock.mockClear()
  window.sessionStorage.clear()
})

describe("ReviewerValidationSummaryTab", () => {
  it("routes a finding from a historical checklist snapshot to its exact Sectioning section", async () => {
    const { ReviewerValidationSummaryTab } = await import("./ReviewerValidationSummaryTab")
    render(<ReviewerValidationSummaryTab label="demo-book" />)

    const openButton = await screen.findByRole("button", { name: "Open in Sectioning" })
    fireEvent.click(openButton)

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$label/$step/$pageId",
      params: { label: "demo-book", step: "sectioning", pageId: "pg001" },
      search: { sectionId: "pg001_sec002" },
    }))
  })
})
