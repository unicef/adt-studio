// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProviderStatusChip } from "./ProviderStatusChip"

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
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
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

describe("ProviderStatusChip", () => {
  afterEach(cleanup)
  beforeEach(() => {
    navigate.mockClear()
    Object.assign(state, { available: false, isLoading: false, error: null, healthCode: "ok" })
  })

  it("opens the providers settings when no provider is connected", () => {
    render(<ProviderStatusChip />)
    fireEvent.click(screen.getByRole("button"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key", from: "add-book" },
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

  it("flags a provider whose key was rejected and links to its card", () => {
    Object.assign(state, { available: true, healthCode: "invalid-credential" })
    render(<ProviderStatusChip />)
    expect(screen.getByText("OpenAI key rejected")).toBeTruthy()
    fireEvent.click(screen.getByRole("button"))
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings/providers",
      search: { auth: "api-key", from: "add-book" },
      hash: "settings-provider-openai",
    })
  })

  it("does not treat an unreachable provider as a rejected key", () => {
    Object.assign(state, { available: true, healthCode: "unreachable" })
    expect(render(<ProviderStatusChip />).container.textContent).toBe("")
  })
})
