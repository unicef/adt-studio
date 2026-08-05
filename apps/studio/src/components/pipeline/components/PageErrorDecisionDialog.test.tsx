// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PageErrorDecisionDialog } from "./PageErrorDecisionDialog"

const resolveDecisionMock = vi.fn()
let pendingDecisions: Array<{
  decisionId: string
  step: string
  pageId: string
  error: string
  canRetry?: boolean
  errorClass?: string
  attempts?: number
}> = []

vi.mock("@lingui/react", () => ({
  Trans: ({ children, id }: { children?: React.ReactNode; id?: string }) => (
    <>{children ?? id}</>
  ),
  useLingui: () => ({
    i18n: {
      _: (value: unknown) =>
        value && typeof value === "object" && "id" in value
          ? String(value.id)
          : String(value),
    },
  }),
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray) {
    return { id: strings.join("") }
  },
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({ pendingDecisions, resolveDecision: resolveDecisionMock }),
}))

vi.mock("../pipeline-i18n", () => ({
  getStepLabelI18n: () => "Image Meaningfulness",
}))

describe("PageErrorDecisionDialog", () => {
  beforeEach(() => {
    resolveDecisionMock.mockReset()
    pendingDecisions = [
      {
        decisionId: "decision-1",
        step: "image-meaningfulness",
        pageId: "pg002",
        error: "Cannot connect to API: other side closed",
        canRetry: true,
        errorClass: "connection-closed",
        attempts: 3,
      },
    ]
  })

  afterEach(cleanup)

  it("retries only the current eligible page without applying a bulk policy", () => {
    render(<PageErrorDecisionDialog />)

    fireEvent.click(screen.getByRole("checkbox"))
    const actionButtons = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("title"))
    expect(actionButtons).toHaveLength(3)
    fireEvent.click(actionButtons[0])

    expect(resolveDecisionMock).toHaveBeenCalledWith(
      "decision-1",
      "retry",
      undefined
    )
    expect(screen.queryByText("connection-closed")).toBeNull()
  })

  it("does not mention or offer retry for a non-retryable failure", () => {
    render(<PageErrorDecisionDialog />)
    const retryableDialog = screen.getByRole("dialog")
    const retryableDescription = retryableDialog.querySelector("p")?.textContent
    const retryableActions = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("title"))
    const retryTitle = retryableActions[0]?.getAttribute("title")
    expect(retryableActions).toHaveLength(3)
    cleanup()

    pendingDecisions = [
      {
        decisionId: "decision-2",
        step: "image-meaningfulness",
        pageId: "pg002",
        error: "Invalid API key",
        canRetry: false,
        errorClass: "non-retryable",
        attempts: 1,
      },
    ]

    render(<PageErrorDecisionDialog />)

    const nonRetryableDescription = screen
      .getByRole("dialog")
      .querySelector("p")?.textContent
    const nonRetryableActions = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("title"))

    expect(nonRetryableDescription).not.toBe(retryableDescription)
    expect(nonRetryableActions).toHaveLength(2)
    expect(
      nonRetryableActions.some((button) => button.getAttribute("title") === retryTitle)
    ).toBe(false)
    expect(screen.queryByText("non-retryable")).toBeNull()
  })
})
