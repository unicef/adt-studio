// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      let text = ""
      for (let index = 0; index < strings.length; index += 1) {
        text += strings[index]
        if (index < values.length) text += String(values[index])
      }
      return text
    },
    i18n: { _: (descriptor: { id: string }) => descriptor.id },
  }),
}))

const { ChatApprovalCode } = await import("./ChatApprovalCode")

afterEach(cleanup)

const LONG = Array.from({ length: 40 }, (_, index) => `line ${index}`).join("\n")

describe("ChatApprovalCode", () => {
  it("shows short content whole, with no toggle", () => {
    render(<ChatApprovalCode code={"one\ntwo"} />)

    expect(screen.getByText(/one/)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("clamps long content until the reader asks for the rest", () => {
    const { container } = render(<ChatApprovalCode code={LONG} />)

    expect(container.textContent).toContain("line 0")
    expect(container.textContent).not.toContain("line 39")

    fireEvent.click(screen.getByRole("button", { name: /show more/i }))
    expect(container.textContent).toContain("line 39")

    fireEvent.click(screen.getByRole("button", { name: /show less/i }))
    expect(container.textContent).not.toContain("line 39")
  })

  it("clamps a single long line, not just many short ones", () => {
    const { container } = render(<ChatApprovalCode code={"x".repeat(2000)} />)

    expect(screen.getByRole("button", { name: /show more/i })).toBeTruthy()
    expect(container.textContent?.length ?? 0).toBeLessThan(600)
  })
})
