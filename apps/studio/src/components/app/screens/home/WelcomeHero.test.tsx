// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WelcomeHero } from "./WelcomeHero"

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
          id: "openai",
          displayName: "OpenAI",
          credentialFields: [{ key: "apiKey", kind: "secret", required: true }],
        },
      },
    ],
    defaults: { "structured-text": "openai:gpt-5" },
    isAvailable: () => state.available,
    isLoading: state.isLoading,
    error: state.error,
  }),
}))

describe("WelcomeHero", () => {
  afterEach(() => {
    cleanup()
    navigate.mockClear()
    Object.assign(state, { available: false, isLoading: false, error: null, healthCode: "ok" })
  })

  it("puts connecting a provider first while no provider is set", () => {
    state.available = false
    render(<WelcomeHero onOpenAdd={vi.fn()} />)
    fireEvent.click(screen.getByText("Connect provider"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key" },
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

  it("asks for a new key when the provider rejects the saved one", () => {
    Object.assign(state, { available: true, healthCode: "invalid-credential" })
    render(<WelcomeHero onOpenAdd={vi.fn()} />)
    expect(screen.getByText("Your OpenAI key was rejected, so books can't be processed yet.")).toBeTruthy()
    fireEvent.click(screen.getByText("Update key"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key" },
      hash: "settings-provider-openai",
    })
  })

  it("shows no key prompt when the live check fails for another reason", () => {
    Object.assign(state, { available: true, healthCode: "unreachable" })
    render(<WelcomeHero onOpenAdd={vi.fn()} />)
    expect(screen.queryByText("Update key")).toBeNull()
    expect(screen.queryByText("Connect provider")).toBeNull()
  })
})
