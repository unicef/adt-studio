// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProviderStatusChip } from "./ProviderStatusChip"

const navigate = vi.fn()
const state = { available: false, isLoading: false, error: null as unknown }

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
}))
vi.mock("@/hooks/use-provider-credentials", () => ({
  useProviderCredentials: () => ({
    isAvailable: () => state.available,
    isLoading: state.isLoading,
    error: state.error,
  }),
}))

describe("ProviderStatusChip", () => {
  afterEach(cleanup)
  beforeEach(() => {
    navigate.mockClear()
    Object.assign(state, { available: false, isLoading: false, error: null })
  })

  it("opens the providers settings when no provider is connected", () => {
    render(<ProviderStatusChip />)
    fireEvent.click(screen.getByRole("button"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      hash: "settings-provider-openai",
    })
  })

  it("renders nothing when a provider is available or still loading", () => {
    state.available = true
    const { container, unmount } = render(<ProviderStatusChip />)
    expect(container.textContent).toBe("")
    unmount()
    Object.assign(state, { available: false, isLoading: true })
    const second = render(<ProviderStatusChip />)
    expect(second.container.textContent).toBe("")
    second.unmount()
    Object.assign(state, { isLoading: false, error: new Error("boom") })
    expect(render(<ProviderStatusChip />).container.textContent).toBe("")
  })
})
