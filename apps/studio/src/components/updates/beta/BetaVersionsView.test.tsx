// @vitest-environment jsdom
import React from "react"
import { setupI18n } from "@lingui/core"
import { I18nProvider } from "@lingui/react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BetaVersionsView } from "./BetaVersionsView"

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock("@/components/ui/dialog", () => ({
  DialogTitle: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 {...props}>{children}</h1>
  ),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, "api")
})

const releases: ElectronAvailableRelease[] = [
  {
    version: "0.7.4-beta.4",
    title: "Reliable translations",
    description: "A focused beta for multilingual books.",
    coverUrl: "https://github.com/user-attachments/assets/translation-cover",
    coverAlt: "Translation cover",
    direction: "upgrade",
    releaseDate: "2026-07-14T09:00:00.000Z",
    releaseNotes: "### What's Changed\n\n- Fixed the updater",
    source: {
      branch: "develop",
      buildCommit: {
        sha: "1a2b3c4d5e6f",
        url: "https://github.com/unicef/adt-studio/commit/1a2b3c4d5e6f",
      },
      prs: [],
    },
  },
  {
    version: "0.7.4-beta.3",
    title: "Faster setup",
    direction: "current",
    releaseDate: "2026-07-13T09:00:00.000Z",
  },
  {
    version: "0.7.4-beta.2",
    title: "Earlier layout",
    direction: "downgrade",
    releaseDate: "2026-07-09T09:00:00.000Z",
    releaseNotes: "Previous behavior and layout details.",
  },
  {
    version: "0.7.3-beta.8",
    title: "Legacy export",
    direction: "downgrade",
    releaseDate: "2026-06-20T09:00:00.000Z",
  },
]

function renderView() {
  const listVersions = vi.fn().mockResolvedValue(releases)
  const selectVersion = vi.fn().mockResolvedValue({
    phase: "available",
    version: "0.7.4-beta.2",
  })
  const download = vi.fn().mockResolvedValue({
    phase: "downloaded",
    version: "0.7.4-beta.2",
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
  const i18n = setupI18n({ locale: "en-US", messages: {} })

  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <BetaVersionsView
          status={{ phase: "not-available" }}
          currentVersion="0.7.4-beta.3"
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    </I18nProvider>,
  )

  return { listVersions, selectVersion, download }
}

describe("BetaVersionsView version library", () => {
  it("lists releases without version groups and exposes search", async () => {
    renderView()

    expect(
      await screen.findByRole("searchbox", { name: "Search beta versions" }),
    ).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Beta versions" })).toBeTruthy()
    const dotGrid = document.querySelector('[data-slot="dot-grid"]')
    expect(dotGrid).toBeTruthy()
    expect(dotGrid?.getAttribute("aria-hidden")).toBe("true")
    expect(screen.queryByRole("heading", { name: "Release library" })).toBeNull()
    expect(screen.queryByText("Browse beta releases by series.")).toBeNull()
    expect(screen.queryByRole("heading", { name: "v0.7.4 series" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "v0.7.3 series" })).toBeNull()
    expect(
      screen.getAllByRole("listitem", { hidden: false }),
    ).toHaveLength(releases.length)
    expect(screen.queryByRole("button", { name: "Install update" })).toBeNull()
  })

  it("opens details directly when a release card is clicked", async () => {
    renderView()
    const release = await screen.findByRole("button", {
      name: "Open details for Reliable translations",
    })

    fireEvent.click(release)
    expect(screen.getByText("A focused beta for multilingual books.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Release notes" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Source" })).toBeTruthy()
    expect(screen.getByText("Fixed the updater")).toBeTruthy()

    fireEvent.keyDown(screen.getByRole("heading", { name: "Release notes" }), {
      key: "Escape",
    })
    expect(
      screen.getByRole("searchbox", { name: "Search beta versions" }),
    ).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", {
          name: "Open details for Reliable translations",
        }),
      ),
    )
  })

  it("confirms a downgrade selected from the list", async () => {
    const { listVersions, selectVersion, download } = renderView()
    const earlier = await screen.findByRole("button", {
      name: "Open details for Earlier layout",
    })

    fireEvent.click(earlier)
    expect(selectVersion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Install older version" }))
    expect(screen.getByText("Install an older beta?")).toBeTruthy()
    const installButtons = screen.getAllByRole("button", {
      name: "Install older version",
    })
    fireEvent.click(installButtons.at(-1)!)

    await waitFor(() => {
      expect(selectVersion).toHaveBeenCalledWith("0.7.4-beta.2")
      expect(download).toHaveBeenCalledOnce()
    })
    expect(listVersions).toHaveBeenCalledWith(true)
  })

  it("supports linear keyboard navigation and opens with Enter", async () => {
    renderView()
    const featured = await screen.findByRole("button", {
      name: "Open details for Reliable translations",
    })
    const current = screen.getByRole("button", {
      name: "Open details for Faster setup",
    })
    const earlier = screen.getByRole("button", {
      name: "Open details for Earlier layout",
    })

    featured.focus()
    fireEvent.keyDown(featured, { key: "ArrowRight" })
    await waitFor(() => expect(document.activeElement).toBe(current))

    fireEvent.keyDown(current, { key: "ArrowDown" })
    await waitFor(() => expect(document.activeElement).toBe(earlier))
    fireEvent.keyDown(earlier, { key: "Enter" })
    expect(screen.getByRole("heading", { name: "Earlier layout" })).toBeTruthy()

    fireEvent.keyDown(screen.getByRole("heading", { name: "Earlier layout" }), {
      key: "Escape",
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Open details for Faster setup" }),
    )
    expect(
      (screen.getByRole("button", { name: "Installed" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it("filters by title, version, and description", async () => {
    renderView()
    const search = await screen.findByRole("searchbox", {
      name: "Search beta versions",
    })

    fireEvent.change(search, { target: { value: "legacy" } })
    expect(
      screen.getByRole("button", { name: "Open details for Legacy export" }),
    ).toBeTruthy()
    expect(
      screen.queryByRole("button", {
        name: "Open details for Reliable translations",
      }),
    ).toBeNull()

    fireEvent.change(search, { target: { value: "v0.7.4-beta.2" } })
    expect(
      screen.getByRole("button", { name: "Open details for Earlier layout" }),
    ).toBeTruthy()

    fireEvent.change(search, { target: { value: "multilingual" } })
    expect(
      screen.getByRole("button", {
        name: "Open details for Reliable translations",
      }),
    ).toBeTruthy()

    fireEvent.change(search, { target: { value: "not-a-release" } })
    expect(screen.getByText("No beta versions found")).toBeTruthy()
    expect(
      screen.getByText("Try another title, version, or description."),
    ).toBeTruthy()
    expect(
      document.querySelector('[data-slot="beta-version-search-empty-state"]'),
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull()

    fireEvent.change(search, { target: { value: "" } })
    expect(
      screen.getByRole("button", { name: "Open details for Legacy export" }),
    ).toBeTruthy()
  })
})
