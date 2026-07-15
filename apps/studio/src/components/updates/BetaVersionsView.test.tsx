// @vitest-environment jsdom
import React from "react"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BetaVersionsView } from "./BetaVersionsView"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    i18n: { locale: "en-US" },
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce(
        (text, part, index) => text + part + String(values[index] ?? ""),
        "",
      )
    },
  }),
}))

vi.mock("@/components/ui/dialog", () => ({
  DialogTitle: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(window, "api")
})

describe("BetaVersionsView", () => {
  it("shows release notes and allows selecting an older version", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 14, 12))
    const listVersions = vi.fn().mockResolvedValue([
      {
        version: "0.7.4-beta.3",
        direction: "upgrade",
        releaseDate: new Date(2026, 6, 14, 9).toISOString(),
        releaseNotes: "# Changes\n\n- Fixed the updater",
      },
      {
        version: "0.7.4-beta.2",
        direction: "current",
        releaseDate: new Date(2026, 6, 13, 9).toISOString(),
      },
      {
        version: "0.7.4-beta.1",
        direction: "downgrade",
        releaseDate: new Date(2026, 6, 9, 9).toISOString(),
        releaseNotes: "# Earlier changes\n\n- Previous behavior",
      },
      {
        version: "0.7.4-beta.0",
        direction: "downgrade",
        releaseDate: new Date(2026, 5, 15, 9).toISOString(),
      },
    ])
    const selectVersion = vi.fn().mockResolvedValue({
      phase: "available",
      version: "0.7.4-beta.1",
    })
    const download = vi.fn().mockResolvedValue({
      phase: "downloaded",
      version: "0.7.4-beta.1",
    })
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { updates: { listVersions, selectVersion, download } },
    })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <BetaVersionsView
          status={{ phase: "not-available" }}
          currentVersion="0.7.4-beta.2"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText("Fixed the updater")).toBeTruthy()
    expect(screen.getByText("Today")).toBeTruthy()
    expect(screen.getByText("Yesterday")).toBeTruthy()
    expect(screen.getByText("Last week")).toBeTruthy()
    expect(screen.getByText("June 2026")).toBeTruthy()
    expect(document.querySelector(".lucide-arrow-down")).toBeNull()
    fireEvent.click(screen.getByText("v0.7.4-beta.2"))
    expect(screen.getByText("Current version")).toBeTruthy()
    fireEvent.click(screen.getByText("v0.7.4-beta.1"))
    expect(await screen.findByText("Previous behavior")).toBeTruthy()
    expect(screen.queryByText("Current version")).toBeNull()
    expect(screen.queryByText("Downgrade")).toBeNull()

    fireEvent.click(
      screen.getByRole("button", { name: "Install older version" }),
    )
    await waitFor(() => {
      expect(selectVersion).toHaveBeenCalledWith("0.7.4-beta.1")
      expect(download).toHaveBeenCalledOnce()
    })
    expect(listVersions).toHaveBeenCalledWith(true)
  })
})
