// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cancelProviderCliLogin,
  getProviderCliLogin,
  logoutProviderCli,
  startProviderCliLogin,
} from "@/api/client"
import { toast } from "@/components/ui/sonner"
import { useCliLogin } from "./use-cli-login"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))
vi.mock("@/api/client", () => ({
  cancelProviderCliLogin: vi.fn(),
  getProviderCliLogin: vi.fn(),
  logoutProviderCli: vi.fn(),
  startProviderCliLogin: vi.fn(),
}))
vi.mock("@/components/ui/sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const cancelLogin = vi.mocked(cancelProviderCliLogin)
const getLogin = vi.mocked(getProviderCliLogin)
const logout = vi.mocked(logoutProviderCli)
const startLogin = vi.mocked(startProviderCliLogin)

function renderCliLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, ...renderHook(() => useCliLogin("codex", true), { wrapper }) }
}

afterEach(() => {
  cleanup()
  cancelLogin.mockReset()
  getLogin.mockReset()
  logout.mockReset()
  startLogin.mockReset()
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.success).mockReset()
})

describe("useCliLogin", () => {
  it("announces success and refreshes health when login completes before start returns", async () => {
    getLogin.mockResolvedValue({ providerId: "codex", state: "idle" })
    startLogin.mockResolvedValue({ providerId: "codex", state: "done" })
    const { queryClient, result } = renderCliLogin()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    act(() => result.current.start())

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Signed in."))
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["provider-health", "codex"] })
    await waitFor(() => expect(result.current.status?.state).toBe("done"))
  })
})
