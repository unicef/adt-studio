// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

const link = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({
  Link: (props: { children: React.ReactNode; to: string; params: unknown; search: unknown }) => {
    link(props)
    return <a href="#">{props.children}</a>
  },
}))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@lingui/core/macro", () => ({ msg: (parts: TemplateStringsArray) => ({ id: parts.join("") }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (descriptor: { id: string }) => descriptor.id } }))
const { HistoryRecoveryLink } = await import("./HistoryRecoveryLink")

afterEach(() => { cleanup(); link.mockClear() })

it("opens the book's History recovery settings for recoverable history damage", () => {
  render(<HistoryRecoveryLink bookLabel="book" error="HISTORY_REPAIR_REQUIRED: page-sectioning/pg001@3" />)
  expect(screen.getByText("Inspect history")).toBeTruthy()
  expect(link).toHaveBeenCalledWith(expect.objectContaining({
    to: "/books/$label/$step/settings",
    params: { label: "book", step: "book" },
    search: { tab: "history" },
  }))
})

it("accepts the HTTP error code when the message is generic", () => {
  render(<HistoryRecoveryLink bookLabel="book" error="Request failed" code="HISTORY_REPAIR_REQUIRED" />)
  expect(screen.getByText("Inspect history")).toBeTruthy()
})

it("renders nothing for other errors and for lost tracking evidence", () => {
  const { container } = render(<>
    <HistoryRecoveryLink bookLabel="book" error="VERSION_CONFLICT: x" code="VERSION_CONFLICT" />
    <HistoryRecoveryLink bookLabel="book" error="HISTORY_REPAIR_REQUIRED: history-evidence/book@0" />
    <HistoryRecoveryLink bookLabel="book" error={null} />
    <HistoryRecoveryLink error="HISTORY_REPAIR_REQUIRED: page-sectioning/pg001@3" />
  </>)
  expect(container.textContent).toBe("")
  expect(link).not.toHaveBeenCalled()
})
