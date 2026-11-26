// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ChatMessage } from "@adt/types"
import { ChatApprovalCard } from "./ChatApprovalCard"
import { ChatMessageItem } from "./ChatMessageItem"
import { toolResultsById, toolStatus } from "./tool-calls"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join(""), i18n: { _: (message: { id: string }) => message.id } }),
}))
vi.mock("@lingui/core/macro", () => ({
  msg: (parts: TemplateStringsArray) => ({ id: parts.join("") }),
}))
afterEach(() => cleanup())

const messages: ChatMessage[] = [
  { role: "user", content: "List the pages" },
  { role: "assistant", text: "Looking.", toolCalls: [{ id: "c1", toolName: "listPages", args: {} }, { id: "c2", toolName: "getPage", args: { pageId: "pg001" } }] },
  { role: "tool", results: [{ id: "c1", toolName: "listPages", result: { pages: [] } }, { id: "c2", toolName: "getPage", result: { error: "missing" }, isError: true }] },
]

describe("chat tool calls", () => {
  it("pairs every call with its result and status", () => {
    const results = toolResultsById(messages)
    expect(toolStatus(results.get("c1"), false, false)).toBe("done")
    expect(toolStatus(results.get("c2"), false, false)).toBe("error")
    expect(toolStatus(undefined, true, false)).toBe("awaiting")
    expect(toolStatus(undefined, false, true)).toBe("running")
  })

  it("renders tool calls as traces inside the assistant message and hides tool messages", () => {
    const results = toolResultsById(messages)
    const { container } = render(
      <>
        {messages.map((message, index) => (
          <ChatMessageItem key={index} message={message} results={results} awaitingIds={new Set()} busy={false} />
        ))}
      </>,
    )
    expect(screen.getByText("List the pages").closest("[data-slot=message]")?.getAttribute("data-align")).toBe("end")
    expect(container.querySelectorAll("[data-slot=trace-collapsible]")).toHaveLength(2)
    expect(container.querySelector("[data-status=error]")).not.toBeNull()
  })

  it("sends one decision per pending call from the approval card", () => {
    const onDecide = vi.fn()
    render(<ChatApprovalCard calls={[{ id: "a", toolName: "updateSection", args: {} }]} onDecide={onDecide} />)
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(onDecide).toHaveBeenCalledWith({ a: true })
  })
})
