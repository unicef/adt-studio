// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api } from "@/api/client"
import { ChatApprovalCard } from "./ChatApprovalCard"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join(""), i18n: { _: (message: { id: string }) => message.id } }),
}))
vi.mock("@lingui/core/macro", () => ({
  msg: (parts: TemplateStringsArray) => ({ id: parts.join("") }),
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mount(calls: Parameters<typeof ChatApprovalCard>[0]["calls"], onDecide = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ChatApprovalCard label="book" calls={calls} onDecide={onDecide} />
    </QueryClientProvider>,
  )
  return onDecide
}

it("AC-24: file writes show a line diff against the effective file", async () => {
  const read = vi.spyOn(api, "getReaderSourceFile").mockResolvedValue({
    path: "features/dock/Dock.tsx",
    layer: "base",
    version: null,
    headVersion: null,
    outdated: false,
    content: "keep\nold line\nkeep too",
    baseHash: "h",
  })
  mount([{ id: "c1", toolName: "writeReaderFile", args: { path: "features/dock/Dock.tsx", content: "keep\nnew line\nkeep too" } }])

  const diff = await screen.findByTestId("reader-file-diff")
  expect(read).toHaveBeenCalledWith("book", "features/dock/Dock.tsx")
  const kinds = [...diff.querySelectorAll("[data-kind]")].map((row) => [row.getAttribute("data-kind"), row.textContent])
  expect(kinds).toEqual([
    ["same", "  keep"],
    ["del", "- old line"],
    ["add", "+ new line"],
    ["same", "  keep too"],
  ])
})

it("sends one decision per pending call", () => {
  const onDecide = mount([
    { id: "a", toolName: "updateSection", args: { pageId: "pg001" } },
    { id: "b", toolName: "listPages", args: {} },
  ])
  fireEvent.click(screen.getByRole("button", { name: "Decline" }))
  expect(onDecide).toHaveBeenCalledWith({ a: false, b: false })
})
