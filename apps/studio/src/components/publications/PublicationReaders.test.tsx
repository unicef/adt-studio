// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const getPublicationReaders = vi.fn()

class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null = null) {
    super(message)
    this.name = "ApiError"
  }
}

vi.mock("@/api/client", () => ({
  api: { getPublicationReaders },
  apiErrorCode: (error: unknown) => (error instanceof ApiError ? error.code : null),
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
        "",
      ),
    i18n: { _: (d: { id?: string }) => d?.id ?? "", locale: "en" },
  }),
}))

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    id: strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? String(values[index]) : ""),
      "",
    ),
  }),
}))

/* The macro transform rewrites the component's imports to `@lingui/react`, so that is the module
   worth intercepting — see the same recipe in publishing-dashboard.test.tsx. */
vi.mock("@lingui/react", () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    _: (d: unknown) => String(d),
    t: (d: unknown) => String(d),
    i18n: { locale: "en", _: (d: unknown) => String(d) },
  }),
  Trans: ({
    message,
    id,
    children,
  }: {
    message?: string
    id?: string
    children?: React.ReactNode
  }) => <>{children ?? (message ?? id ?? "").replace(/<\/?\d+>/g, "")}</>,
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { PublicationReaders } = await import("./PublicationReaders")

const TOKEN = "TokenRavenTokenRavenTokenRaven12"

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe("PublicationReaders when the roster cannot be read", () => {
  /**
   * The panel used to render `error.message`, so a transport failure put a bare "404 Not Found"
   * on a dashboard whose own header says "Service not answering". The roster is one of four
   * places on that screen that learn the same fact; they now say it the same way.
   */
  it("never shows the transport's own sentence", async () => {
    getPublicationReaders.mockRejectedValue(new ApiError("404 Not Found", 404, null))
    render(<PublicationReaders token={TOKEN} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByTestId("publication-readers-unavailable")).toBeTruthy()
    })
    expect(document.body.textContent).not.toContain("404")
    expect(document.body.textContent).toContain("Service not answering")
  })

  it("asks for an account when that is what is missing, instead of blaming the service", async () => {
    getPublicationReaders.mockRejectedValue(
      new ApiError("Connect a Cloudflare account", 412, "publish_not_connected"),
    )
    render(<PublicationReaders token={TOKEN} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByTestId("publication-readers-unavailable")).toBeTruthy()
    })
    expect(document.body.textContent).toContain("Connect a Cloudflare account")
    expect(document.body.textContent).not.toContain("Service not answering")
  })
})
