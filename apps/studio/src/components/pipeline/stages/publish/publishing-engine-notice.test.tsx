// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

/* The Lingui macro transform rewrites macro imports to `@lingui/react` at build time, so a mock of
   the macro path never intercepts the components' real calls — this one does. Messages come
   through as `{id, message, values}` descriptors; interpolation is the naive `{name}` swap, which
   is all these assertions need. */
vi.mock("@lingui/react", () => {
  const fill = (text: string, values?: Record<string, unknown>) =>
    Object.entries(values ?? {}).reduce(
      (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
      text,
    )
  const resolve = (descriptor: unknown, values?: Record<string, unknown>): string => {
    if (typeof descriptor === "string") return fill(descriptor, values)
    const d = descriptor as { message?: string; id?: string; values?: Record<string, unknown> }
    return fill(d?.message ?? d?.id ?? "", values ?? d?.values)
  }
  return {
    I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useLingui: () => ({
      _: resolve,
      t: resolve,
      i18n: { locale: "en", _: resolve, number: (n: number) => String(n) },
    }),
    Trans: ({
      message,
      id,
      values,
      children,
    }: {
      message?: string
      id?: string
      values?: Record<string, unknown>
      children?: React.ReactNode
    }) => {
      const text = (message ?? id ?? "").replace(/<\/?\d+>/g, "")
      return <>{children ?? fill(text, values)}</>
    },
  }
})

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: (s: TemplateStringsArray) => s.join(""), i18n: { _: () => "", locale: "en" } }),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const connection = vi.fn()
vi.mock("@/hooks/use-cloudflare-connection", () => ({ useCloudflareConnection: () => connection() }))
vi.mock("@/hooks/use-cloudflare-credentials", () => ({
  useCloudflareCredentials: () => ({ credentials: {} }),
}))

const { PublishingEngineNotice } = await import("./PublishingEngineNotice")

function status(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      connected: true,
      worker_reachable: true,
      upgrade_available: false,
      worker_version: "0.9.0",
      latest_version: "0.9.0",
      ...overrides,
    },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PublishingEngineNotice", () => {
  it("says nothing when the service matches the Studio", () => {
    connection.mockReturnValue(status())
    render(<PublishingEngineNotice />)
    expect(screen.queryByTestId("publish-engine-outdated")).toBeNull()
    expect(screen.queryByTestId("publish-engine-unreachable")).toBeNull()
  })

  /**
   * The case this exists for. A stale service makes a feature simply absent, and the way that
   * surfaced was a readers panel claiming a healthy publication was "not in this account".
   */
  it("names both versions when the service is behind", () => {
    connection.mockReturnValue(
      status({ upgrade_available: true, worker_version: "0.9.0", latest_version: "0.10.0" }),
    )
    render(<PublishingEngineNotice />)
    const notice = screen.getByTestId("publish-engine-outdated")
    expect(notice.textContent).toContain("0.9.0")
    expect(notice.textContent).toContain("0.10.0")
    expect(screen.getByRole("link", { name: /install the update/i })).toBeTruthy()
  })

  /** A version comparison against a service that is not answering means nothing, so it does not
   *  guess — it reports the silence instead. */
  it("reports silence rather than comparing versions with an unreachable service", () => {
    connection.mockReturnValue(status({ worker_reachable: false, upgrade_available: true }))
    render(<PublishingEngineNotice />)
    expect(screen.getByTestId("publish-engine-unreachable")).toBeTruthy()
    expect(screen.queryByTestId("publish-engine-outdated")).toBeNull()
  })

  it("stays out of the way when no account is connected", () => {
    connection.mockReturnValue({ data: { connected: false } })
    render(<PublishingEngineNotice />)
    expect(document.body.textContent).toBe("")
  })
})
