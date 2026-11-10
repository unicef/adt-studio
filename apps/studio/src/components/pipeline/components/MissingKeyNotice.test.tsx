// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MissingKeyNotice } from "./MissingKeyNotice"

const state = { available: false, ready: true }
let rejected: { providerId: string; displayName: string } | null = null
const navigate = vi.fn()

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))
// `select` keeps its `other` branch, which is the English text.
vi.mock("@lingui/core/macro", () => ({
  select: (_value: string, branches: { other: string }) => branches.other,
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))
vi.mock("@/hooks/use-api-key", () => ({
  useBookStructuredTextStatus: () => state,
  useBookRejectedTextProvider: () => rejected,
}))

describe("MissingKeyNotice", () => {
  afterEach(cleanup)
  beforeEach(() => {
    navigate.mockClear()
    Object.assign(state, { available: false, ready: true })
    rejected = null
  })

  it("explains the missing provider and opens the providers settings", () => {
    render(<MissingKeyNotice bookLabel="b" />)
    expect(screen.getByText("One step before you can run this")).toBeTruthy()
    fireEvent.click(screen.getByText("Connect provider"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key" },
      hash: "settings-provider-openai",
    })
  })

  it("renders nothing until the provider status can be trusted", () => {
    state.ready = false
    const { container } = render(<MissingKeyNotice bookLabel="b" />)
    expect(container.textContent).toBe("")
  })

  it("renders nothing once a provider is available", () => {
    state.available = true
    const { container } = render(<MissingKeyNotice bookLabel="b" />)
    expect(container.textContent).toBe("")
  })

  it("warns about a rejected key and opens that provider's card", () => {
    state.available = true
    rejected = { providerId: "google", displayName: "Google" }
    render(<MissingKeyNotice bookLabel="b" />)
    expect(screen.getByText("Your Google key was rejected")).toBeTruthy()
    fireEvent.click(screen.getByText("Update key"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key" },
      hash: "settings-provider-google",
    })
  })
})
