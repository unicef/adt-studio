// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NoProviderGate } from "./NoProviderGate"

const navigate = vi.fn()
const state = { available: false, isLoading: false, error: null as unknown }

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/hooks/use-provider-credentials", () => ({
  useProviderCredentials: () => ({
    isAvailable: () => state.available,
    isLoading: state.isLoading,
    error: state.error,
  }),
}))

const renderGate = () =>
  render(
    <NoProviderGate>
      <div>wizard</div>
    </NoProviderGate>,
  )

describe("NoProviderGate", () => {
  afterEach(cleanup)
  beforeEach(() => {
    navigate.mockClear()
    Object.assign(state, { available: false, isLoading: false, error: null })
  })

  it("asks for a provider over the wizard when none is connected", () => {
    renderGate()
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByText("wizard")).toBeTruthy()
  })

  it("stays hidden when a provider is available, loading, or failed to load", () => {
    state.available = true
    const first = renderGate()
    expect(screen.queryByRole("dialog")).toBeNull()
    first.unmount()
    Object.assign(state, { available: false, isLoading: true })
    const second = renderGate()
    expect(screen.queryByRole("dialog")).toBeNull()
    second.unmount()
    Object.assign(state, { isLoading: false, error: new Error("boom") })
    renderGate()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("sends the user to the OpenAI provider card", () => {
    renderGate()
    fireEvent.click(screen.getByText("Connect provider"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      hash: "settings-provider-openai",
    })
  })

  it("lets the user continue without a provider", () => {
    renderGate()
    fireEvent.click(screen.getByText("Continue without a provider"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByText("wizard")).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })
})
