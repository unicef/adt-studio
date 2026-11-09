// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NoProviderGate } from "./NoProviderGate"

const navigate = vi.fn()
const state = {
  available: false,
  isLoading: false,
  error: null as unknown,
  healthCode: "ok" as string,
}

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/hooks/use-provider-health", () => ({
  useProviderHealth: (providerId: string, _draft: unknown, enabled: boolean) => ({
    data: enabled ? { providerId, ok: state.healthCode === "ok", code: state.healthCode } : undefined,
  }),
}))
vi.mock("@/hooks/use-provider-credentials", () => ({
  useProviderCredentials: () => ({
    providers: [
      {
        manifest: {
          id: "anthropic",
          displayName: "Anthropic",
          credentialFields: [{ key: "apiKey", kind: "secret", required: true }],
        },
      },
    ],
    defaults: { "structured-text": "anthropic:claude-sonnet" },
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
    Object.assign(state, { available: false, isLoading: false, error: null, healthCode: "ok" })
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

  it("opens with the connect action focused, not the way out", async () => {
    renderGate()
    const connect = screen.getByText("Connect provider").closest("button")
    await waitFor(() => expect(document.activeElement).toBe(connect))
  })

  it("sends the user to the OpenAI provider card", () => {
    renderGate()
    fireEvent.click(screen.getByText("Connect provider"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key", from: "add-book" },
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

  it("asks for a new key when the provider rejects the saved one", () => {
    Object.assign(state, { available: true, healthCode: "invalid-credential" })
    renderGate()
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByText("Your Anthropic key was rejected")).toBeTruthy()
    fireEvent.click(screen.getByText("Update key"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key", from: "add-book" },
      hash: "settings-provider-anthropic",
    })
  })

  it("lets the user continue past a rejected key", () => {
    Object.assign(state, { available: true, healthCode: "invalid-credential" })
    renderGate()
    fireEvent.click(screen.getByText("Continue anyway"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("stays hidden when the live check fails for a reason other than the key", () => {
    Object.assign(state, { available: true, healthCode: "unreachable" })
    renderGate()
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
