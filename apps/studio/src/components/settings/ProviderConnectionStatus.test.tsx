// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ProviderHealthResponse } from "@adt/types"
import { getProviderHealth } from "@/api/client"
import { ProviderConnectionStatus } from "./ProviderConnectionStatus"

vi.mock("@/api/client", () => ({ getProviderHealth: vi.fn() }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  Plural: ({ value, one, other }: { value: number; one: string; other: string }) => (
    <>{(value === 1 ? one : other).replace("#", String(value))}</>
  ),
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), ""),
  }),
}))

const health = vi.mocked(getProviderHealth)

function renderStatus(providerId = "codex", drafts?: Record<string, string>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProviderConnectionStatus providerId={providerId} draftCredentials={drafts} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  health.mockReset()
})

describe("ProviderConnectionStatus", () => {
  it("reports a verified local CLI login", async () => {
    health.mockResolvedValue({
      providerId: "codex",
      ok: true,
      code: "local-login",
      detail: "API key",
    })

    renderStatus()

    await waitFor(() =>
      expect(
        screen.getByText("Connected through the login already present on this machine."),
      ).toBeTruthy(),
    )
    expect(screen.getByText("API key")).toBeTruthy()
  })

  it("reports a model count for a discovery-based check", async () => {
    health.mockResolvedValue({
      providerId: "ollama",
      ok: true,
      code: "ok",
      modelCount: 3,
    } satisfies ProviderHealthResponse)

    renderStatus("ollama")

    await waitFor(() =>
      expect(screen.getByText("Connected successfully — 3 models available.")).toBeTruthy(),
    )
  })

  it("explains a missing local login", async () => {
    health.mockResolvedValue({ providerId: "codex", ok: false, code: "not-logged-in" })

    renderStatus()

    await waitFor(() =>
      expect(
        screen.getByText(
          "No login found on this machine. Sign in with the provider's CLI or set an API key.",
        ),
      ).toBeTruthy(),
    )
  })

  it("re-checks with the credentials currently typed in", async () => {
    health.mockResolvedValue({ providerId: "codex", ok: true, code: "ok" })

    renderStatus("codex", { apiKey: "sk-draft" })
    await waitFor(() => expect(screen.getByText("Connected successfully.")).toBeTruthy())
    expect(health).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }))

    await waitFor(() => expect(health).toHaveBeenCalledTimes(2))
    expect(health).toHaveBeenLastCalledWith("codex", { apiKey: "sk-draft" })
  })

  it("surfaces a failed check instead of a stale verdict", async () => {
    health.mockRejectedValue(new Error("network down"))

    renderStatus()

    await waitFor(() =>
      expect(screen.getByText("The connection check could not be completed.")).toBeTruthy(),
    )
  })
})
