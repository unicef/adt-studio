// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProvidersSection } from "./ProvidersSection"

const navigate = vi.fn()
const search: { from?: string } = {}
const state = { available: false, isLoading: false, error: null as unknown }

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => search,
}))
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
vi.mock("./ui", () => ({
  SettingsHeading: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  SettingsLead: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))
vi.mock("./providers/ProvidersList", () => ({ ProvidersList: () => <div>providers</div> }))

const continueButton = () => screen.queryByRole("button", { name: /Continue adding your book/ })

describe("ProvidersSection — way back to Add Book", () => {
  afterEach(cleanup)
  beforeEach(() => {
    navigate.mockClear()
    delete search.from
    Object.assign(state, { available: false, isLoading: false, error: null })
  })

  it("offers to continue adding the book once a provider is connected", () => {
    search.from = "add-book"
    state.available = true
    render(<ProvidersSection />)
    fireEvent.click(continueButton()!)
    expect(navigate).toHaveBeenCalledWith({ to: "/books/new" })
  })

  it("waits until a provider is actually connected", () => {
    search.from = "add-book"
    const first = render(<ProvidersSection />)
    expect(continueButton()).toBeNull()
    first.unmount()
    Object.assign(state, { available: true, isLoading: true })
    render(<ProvidersSection />)
    expect(continueButton()).toBeNull()
  })

  it("stays hidden when the user did not come from Add Book", () => {
    state.available = true
    render(<ProvidersSection />)
    expect(continueButton()).toBeNull()
  })
})
