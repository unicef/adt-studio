// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MissingKeyNotice } from "./MissingKeyNotice"

const state = { available: false, ready: true }
const navigate = vi.fn()

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/hooks/use-api-key", () => ({
  useBookStructuredTextStatus: () => state,
}))

describe("MissingKeyNotice", () => {
  afterEach(cleanup)
  beforeEach(() => {
    navigate.mockClear()
    Object.assign(state, { available: false, ready: true })
  })

  it("explains the missing provider and opens the providers settings", () => {
    render(<MissingKeyNotice bookLabel="b" />)
    expect(screen.getByText("One step before you can run this")).toBeTruthy()
    fireEvent.click(screen.getByText("Connect provider"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
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
})
