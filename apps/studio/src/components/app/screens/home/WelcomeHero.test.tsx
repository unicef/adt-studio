// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WelcomeHero } from "./WelcomeHero"

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

describe("WelcomeHero", () => {
  afterEach(() => {
    cleanup()
    navigate.mockClear()
    Object.assign(state, { available: false, isLoading: false, error: null })
  })

  it("puts connecting a provider first while no provider is set", () => {
    state.available = false
    render(<WelcomeHero onOpenAdd={vi.fn()} />)
    fireEvent.click(screen.getByText("Connect provider"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      hash: "settings-provider-openai",
    })
  })

  it("hides the key step while providers load or when they failed to load", () => {
    Object.assign(state, { available: false, isLoading: true, error: null })
    const first = render(<WelcomeHero onOpenAdd={vi.fn()} />)
    expect(screen.queryByText("Connect provider")).toBeNull()
    first.unmount()
    Object.assign(state, { isLoading: false, error: new Error("boom") })
    render(<WelcomeHero onOpenAdd={vi.fn()} />)
    expect(screen.queryByText("Connect provider")).toBeNull()
  })

  it("hides the key step when a provider is available", () => {
    Object.assign(state, { available: true, isLoading: false, error: null })
    render(<WelcomeHero onOpenAdd={vi.fn()} />)
    expect(screen.queryByText("Connect provider")).toBeNull()
  })
})
