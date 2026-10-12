// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@lingui/react", () => ({ useLingui: () => ({ i18n: { _: () => "label" } }) }))
vi.mock("@lingui/core/macro", () => ({ msg: () => ({ message: "label" }) }))
vi.mock("../pipeline-i18n", () => ({ getStepLabelI18n: () => "Sectioning" }))
vi.mock("@/hooks/use-book-run", () => ({ useBookRun: () => ({ pendingDecisions: [{ decisionId: "d1", pageId: "pg001", step: "page-sectioning", error: "SECTIONING_INPUT_UNREADABLE: saved page" }], resolveDecision: vi.fn() }) }))
const translate = vi.hoisted(() => vi.fn(() => "Translated recovery guidance"))
vi.mock("@/lib/sectioning-error", () => ({ sectioningErrorMessage: translate }))
const { PageErrorDecisionDialog } = await import("./PageErrorDecisionDialog")
afterEach(cleanup)
it("presents the common translated error for live or reconnected pending decisions", () => {
  render(<PageErrorDecisionDialog />)
  expect(translate).toHaveBeenCalledWith("SECTIONING_INPUT_UNREADABLE: saved page")
  expect(screen.getByText("Translated recovery guidance")).toBeTruthy()
  expect(screen.queryByText(/SECTIONING_INPUT_UNREADABLE/)).toBeNull()
})
